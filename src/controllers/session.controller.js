const mongoose = require("mongoose");
const Session = require("../models/session.model");
const Student = require("../models/student.model");
const Field = require("../models/field.model");
const { http_error } = require("../middlewares/error.middleware");
const { is_valid_id, is_valid_date, is_valid_date_range, clean_title, clean_entries, parse_pagination } = require("../utils/validate");
const { MAX_EVALUATIONS_PER_SESSION } = require("../config/constants");
const { require_section } = require("../utils/section");

const ENTRIES_ERROR = "أدخل شيئاً واحداً على الأقل في أحد أقسام المتابعة (والنصوص ليست طويلة جداً والتقدير مسموح به)";
const END_DATE_ERROR = "تاريخ النهاية يجب أن يكون بصيغة YYYY-MM-DD وبعد تاريخ البداية أو مساوياً له";

// تاريخ النهاية اختياري. نص فارغ = بدون نهاية. يُرجع null إذا كان غير صالح.
function clean_end_date(value, start_date) {
    if (value === undefined || value === null || value === "") {
        return "";
    }
    if (!is_valid_date_range(start_date, value)) {
        return null;
    }
    return value;
}

// نتحقق من نوع كل قسم وحالته، ونحتفظ بالاسم التاريخي للخانات الموجودة.
async function build_entries(section, clean_list, existing_entries, adding) {
    const ids = clean_list.map((item) => item.fieldId);
    const fields = await Field.find({ _id: { $in: ids }, section }).lean();
    const by_id = new Map(fields.map((field) => [String(field._id), field]));
    const previous = new Map((existing_entries || []).map((entry) => [String(entry.fieldId), entry]));

    return clean_list.map((item) => {
        const field = by_id.get(item.fieldId);
        if (!field) throw http_error(400, "قسم المتابعة غير موجود في هذا القسم");
        const old_entry = previous.get(item.fieldId);
        if (!field.isActive && (adding || !old_entry)) {
            throw http_error(409, "لا يمكن إضافة بيانات جديدة إلى قسم متابعة معطّل");
        }
        if (field.kind === "text" && (item.from || item.to)) {
            throw http_error(400, "هذا القسم نصّي؛ أدخل المحتوى في خانة النص فقط");
        }
        if (field.kind === "range" && item.content) {
            throw http_error(400, "هذا القسم من/إلى؛ استخدم حقلي البداية والنهاية فقط");
        }
        return {
            fieldId: item.fieldId,
            fieldName: old_entry && old_entry.fieldName ? old_entry.fieldName : field.name,
            content: field.kind === "text" ? item.content : "",
            from: field.kind === "range" ? item.from : "",
            to: field.kind === "range" ? item.to : "",
            grade: item.grade
        };
    });
}

// ---------- دوال مساعدة صغيرة ----------

function get_session_id(req) {
    if (!is_valid_id(req.params.id)) {
        throw http_error(400, "معرف الجلسة غير صحيح");
    }
    return req.params.id;
}

// عندما لا يجد التحديث شيئاً نعرف السبب: الجلسة غير موجودة أم التقييم؟
async function throw_missing_session_or_evaluation(session_id) {
    const session_exists = await Session.exists({ _id: session_id });
    if (!session_exists) {
        throw http_error(404, "الجلسة غير موجودة");
    }
    throw http_error(404, "التقييم غير موجود");
}

// ---------- الجلسات ----------

// POST /api/sessions   { section, title?, date, endDate? }
async function create_session(req, res, next) {
    try {
        const body = req.body || {};

        const section = require_section(body.section);

        const title = clean_title(body.title);
        if (title === null) {
            throw http_error(400, "عنوان الجلسة غير صالح أو طويل جداً");
        }

        if (!is_valid_date(body.date)) {
            throw http_error(400, "تاريخ الجلسة مطلوب بصيغة YYYY-MM-DD");
        }

        const end_date = clean_end_date(body.endDate, body.date);
        if (end_date === null) {
            throw http_error(400, END_DATE_ERROR + " (والحد الأقصى للمدى 31 يوماً)");
        }

        const session = await Session.create({ title, date: body.date, endDate: end_date, section });

        res.status(201).json({
            success: true,
            data: session
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/sessions?section=boys|girls   (أحدث الجلسات أولاً، مع عدد التقييمات فقط)
async function get_sessions(req, res, next) {
    try {
        const section = require_section(req.query.section);
        const paging = parse_pagination(req.query);
        if (!paging) throw http_error(400, "قيم limit وskip غير صالحة (الحد الأقصى للصفحة 100)");
        const [sessions, total] = await Promise.all([
            Session.list_summaries(section, paging.limit, paging.skip),
            Session.countDocuments({ section })
        ]);
        res.status(200).json({ success: true, data: sessions, meta: { ...paging, total } });
    } catch (error) {
        next(error);
    }
}

// GET /api/sessions/:id
async function get_session(req, res, next) {
    try {
        const session_id = get_session_id(req);

        const session = await Session.findById(session_id);
        if (!session) {
            throw http_error(404, "الجلسة غير موجودة");
        }

        res.status(200).json({
            success: true,
            data: session
        });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/sessions/:id
async function delete_session(req, res, next) {
    try {
        const session_id = get_session_id(req);

        const session = await Session.findByIdAndDelete(session_id);
        if (!session) {
            throw http_error(404, "الجلسة غير موجودة");
        }

        res.status(200).json({
            success: true,
            data: null,
            message: "تم حذف الجلسة"
        });
    } catch (error) {
        next(error);
    }
}

// ---------- PATCH /api/sessions/:id ----------
// الطلب يحمل حقل action يحدد العملية:
//   update_session    : { action, title?, date?, endDate? }
//   add_evaluation    : { action, studentId, entries: [{ fieldId, content?, from?, to?, grade? }] }
//   update_evaluation : { action, evaluationId, entries }
//   delete_evaluation : { action, evaluationId }

function patch_session(req, res, next) {
    const action = (req.body || {}).action;

    if (action === "update_session") {
        return update_session_info(req, res, next);
    }
    if (action === "add_evaluation") {
        return add_evaluation(req, res, next);
    }
    if (action === "update_evaluation") {
        return update_evaluation(req, res, next);
    }
    if (action === "delete_evaluation") {
        return delete_evaluation(req, res, next);
    }

    next(http_error(400, "نوع العملية (action) غير صحيح"));
}

async function update_session_info(req, res, next) {
    try {
        const session_id = get_session_id(req);
        const body = req.body || {};
        const updates = {};

        if (body.title !== undefined) {
            const title = clean_title(body.title);
            if (title === null) {
                throw http_error(400, "عنوان الجلسة غير صالح أو طويل جداً");
            }
            updates.title = title;
        }

        if (body.date !== undefined) {
            if (!is_valid_date(body.date)) {
                throw http_error(400, "التاريخ يجب أن يكون بصيغة YYYY-MM-DD");
            }
            updates.date = body.date;
        }

        // تغيير تاريخ البداية وحده يجب ألا يتجاوز تاريخ النهاية المحفوظ
        if (updates.date !== undefined && body.endDate === undefined) {
            const current = await Session.findById(session_id).select("endDate").lean();
            if (current && current.endDate && !is_valid_date_range(updates.date, current.endDate)) {
                throw http_error(400, END_DATE_ERROR + " (والحد الأقصى للمدى 31 يوماً)");
            }
        }

        if (body.endDate !== undefined) {
            // نقارن بتاريخ البداية الجديد إن أُرسل، وإلا بالمحفوظ
            let start_date = updates.date;
            if (start_date === undefined) {
                const current = await Session.findById(session_id).select("date").lean();
                if (!current) {
                    throw http_error(404, "الجلسة غير موجودة");
                }
                start_date = current.date;
            }
            const end_date = clean_end_date(body.endDate, start_date);
            if (end_date === null) {
                throw http_error(400, END_DATE_ERROR);
            }
            updates.endDate = end_date;
        }

        if (Object.keys(updates).length === 0) {
            throw http_error(400, "لا توجد بيانات للتعديل");
        }

        const session = await Session.findByIdAndUpdate(session_id, updates, {
            new: true,
            runValidators: true
        });
        if (!session) {
            throw http_error(404, "الجلسة غير موجودة");
        }

        res.status(200).json({
            success: true,
            data: session
        });
    } catch (error) {
        next(error);
    }
}

async function add_evaluation(req, res, next) {
    try {
        const session_id = get_session_id(req);
        const body = req.body || {};

        if (!is_valid_id(body.studentId)) {
            throw http_error(400, "معرف الطالب غير صحيح");
        }
        const clean_list = clean_entries(body.entries);
        if (clean_list === null) {
            throw http_error(400, ENTRIES_ERROR);
        }

        const student = await Student.findById(body.studentId);
        if (!student) {
            throw http_error(404, "الطالب غير موجود");
        }
        if (!student.isActive) {
            throw http_error(409, "لا يمكن إضافة تقييم لطالب غير نشط");
        }

        const session_info = await Session.findById(session_id).select("section").lean();
        if (!session_info) {
            throw http_error(404, "الجلسة غير موجودة");
        }
        if (session_info.section !== student.section) {
            throw http_error(409, "هذا الطالب ليس من نفس قسم الجلسة");
        }

        const new_evaluation = {
            _id: new mongoose.Types.ObjectId(),
            studentId: student._id,
            studentName: student.name,
            entries: await build_entries(session_info.section, clean_list, [], true),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // الشرطان داخل أمر واحد في قاعدة البيانات (فلا يمر طلبان متزامنان):
        //  1) الجلسة من نفس قسم الطالب، فلا يدخل طالب من قسم في جلسة قسم آخر
        //  2) لا يوجد في الجلسة تقييم لنفس الطالب (صف واحد لكل طالب)
        const result = await Session.updateOne(
            {
                _id: session_id,
                section: student.section,
                $nor: [{ evaluations: { $elemMatch: { studentId: student._id } } }],
                $expr: { $lt: [{ $size: { $ifNull: ["$evaluations", []] } }, MAX_EVALUATIONS_PER_SESSION] }
            },
            { $push: { evaluations: new_evaluation }, $inc: { evaluationsCount: 1 }, $set: { updatedAt: new Date() } },
            { runValidators: true }
        );

        if (result.matchedCount === 0) {
            const existing = await Session.findById(session_id).select("section").lean();
            if (!existing) {
                throw http_error(404, "الجلسة غير موجودة");
            }
            if (existing.section !== student.section) {
                throw http_error(409, "هذا الطالب ليس من نفس قسم الجلسة");
            }
            const count_info = await Session.findById(session_id).select("evaluationsCount evaluations").lean();
            if (count_info && (count_info.evaluationsCount || (count_info.evaluations || []).length) >= MAX_EVALUATIONS_PER_SESSION) {
                throw http_error(409, "وصلت الجلسة إلى الحد الأقصى للتقييمات (500 طالب)");
            }
            throw http_error(409, "هذا الطالب لديه تقييم في هذه الجلسة بالفعل");
        }

        const session = await Session.findById(session_id);

        res.status(201).json({
            success: true,
            data: session
        });
    } catch (error) {
        next(error);
    }
}

// نسمح بتعديل خانات الصف فقط (تستبدل كل الخانات القديمة بالمرسلة).
// لتغيير الطالب: احذف التقييم وأضف تقييماً جديداً (فيمر على فحص القسم والتكرار).
async function update_evaluation(req, res, next) {
    try {
        const session_id = get_session_id(req);
        const body = req.body || {};

        if (!is_valid_id(body.evaluationId)) {
            throw http_error(400, "معرف التقييم غير صحيح");
        }
        if (body.entries === undefined) {
            throw http_error(400, "لا توجد بيانات للتعديل");
        }
        const clean_list = clean_entries(body.entries);
        if (clean_list === null) {
            throw http_error(400, ENTRIES_ERROR);
        }

        const session_info = await Session.findById(session_id).select("section evaluations").lean();
        if (!session_info) throw http_error(404, "الجلسة غير موجودة");
        const old_evaluation = (session_info.evaluations || []).find((item) => String(item._id) === body.evaluationId);
        if (!old_evaluation) throw http_error(404, "التقييم غير موجود");

        let expected_updated_at = null;
        if (body.expectedUpdatedAt !== undefined) {
            const parsed = new Date(body.expectedUpdatedAt);
            if (typeof body.expectedUpdatedAt !== "string" || Number.isNaN(parsed.getTime())) {
                throw http_error(400, "قيمة expectedUpdatedAt غير صالحة");
            }
            expected_updated_at = parsed;
            if (!old_evaluation.updatedAt || new Date(old_evaluation.updatedAt).getTime() !== parsed.getTime()) {
                throw http_error(409, "تم تعديل هذا الصف من مكان آخر، أعد تحميل الصفحة");
            }
        }

        const entries = await build_entries(session_info.section, clean_list, old_evaluation.entries || [], false);
        const now = new Date();
        const evaluation_match = { _id: body.evaluationId };
        if (expected_updated_at) evaluation_match.updatedAt = expected_updated_at;
        const filter = { _id: session_id, evaluations: { $elemMatch: evaluation_match } };
        // لا نفحص حالة الطالب هنا: تعديل التقييمات القديمة مسموح حتى بعد تعطيل الطالب.
        const result = await Session.updateOne(
            filter,
            { $set: { "evaluations.$.entries": entries, "evaluations.$.updatedAt": now, updatedAt: now } },
            { runValidators: true }
        );

        if (result.matchedCount === 0) {
            if (expected_updated_at) throw http_error(409, "تم تعديل هذا الصف من مكان آخر، أعد تحميل الصفحة");
            await throw_missing_session_or_evaluation(session_id);
        }

        const session = await Session.findById(session_id);

        res.status(200).json({
            success: true,
            data: session
        });
    } catch (error) {
        next(error);
    }
}

async function delete_evaluation(req, res, next) {
    try {
        const session_id = get_session_id(req);
        const body = req.body || {};

        if (!is_valid_id(body.evaluationId)) {
            throw http_error(400, "معرف التقييم غير صحيح");
        }

        const result = await Session.updateOne(
            { _id: session_id, "evaluations._id": body.evaluationId },
            { $pull: { evaluations: { _id: body.evaluationId } }, $inc: { evaluationsCount: -1 }, $set: { updatedAt: new Date() } },
            { runValidators: true }
        );

        if (result.matchedCount === 0) {
            await throw_missing_session_or_evaluation(session_id);
        }

        const session = await Session.findById(session_id);

        res.status(200).json({
            success: true,
            data: session
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    create_session,
    get_sessions,
    get_session,
    patch_session,
    delete_session
};
