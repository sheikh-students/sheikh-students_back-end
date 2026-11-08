const Session = require("../models/session.model");
const Field = require("../models/field.model");
const { http_error } = require("../middlewares/error.middleware");
const { is_valid_id } = require("../utils/validate");
const { ensure_default_fields } = require("../utils/fields");

async function get_session_report(req, res, next) {
    try {
        if (!is_valid_id(req.params.id)) throw http_error(400, "معرف الجلسة غير صحيح");
        const session = await Session.findById(req.params.id).lean();
        if (!session) throw http_error(404, "الجلسة غير موجودة");
        await ensure_default_fields(session.section);
        const fields = await Field.find({ section: session.section }).sort({ order: 1, _id: 1 }).lean();
        const saved_names = new Map();
        const used_ids = new Set();
        (session.evaluations || []).forEach((evaluation) => {
            (evaluation.entries || []).forEach((entry) => {
                const id = String(entry.fieldId);
                used_ids.add(id);
                if (!saved_names.has(id) && entry.fieldName) saved_names.set(id, entry.fieldName);
            });
        });
        const columns = fields.filter((field) => field.isActive || used_ids.has(String(field._id))).map((field) => ({
            id: String(field._id),
            // الاسم المحفوظ وقت التسجيل هو المرجع للتقارير التاريخية.
            name: saved_names.get(String(field._id)) || field.name,
            kind: field.kind
        }));
        let has_legacy = false;
        const evaluations = (session.evaluations || []).map((item) => {
            const cells = {};
            (item.entries || []).forEach((entry) => {
                cells[String(entry.fieldId)] = {
                    content: entry.content || "", from: entry.from || "", to: entry.to || "", grade: entry.grade || ""
                };
            });
            const legacy_material = item.material || "";
            const legacy_grade = item.grade || "";
            if (legacy_material || legacy_grade) has_legacy = true;
            return { studentName: item.studentName, cells, legacy: { material: legacy_material, grade: legacy_grade } };
        });
        res.status(200).json({
            success: true,
            data: {
                title: session.title || "", date: session.date, endDate: session.endDate || "", section: session.section,
                totalEvaluations: evaluations.length, columns, hasLegacy: has_legacy, evaluations
            }
        });
    } catch (error) { next(error); }
}
module.exports = { get_session_report };
