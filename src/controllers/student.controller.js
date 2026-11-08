const Student = require("../models/student.model");
const { http_error } = require("../middlewares/error.middleware");
const { is_valid_id, clean_student_name, normalize_arabic_search, parse_pagination } = require("../utils/validate");
const { require_section } = require("../utils/section");

// POST /api/students   { name, section }
async function create_student(req, res, next) {
    try {
        const body = req.body || {};

        const section = require_section(body.section);

        const name = clean_student_name(body.name);
        if (!name) {
            throw http_error(400, "اسم الطالب مطلوب ويجب ألا يزيد عن 100 حرف");
        }

        // نتجاهل أي isActive مرسل: الطالب الجديد يبدأ نشطاً دائماً
        const student = await Student.create({ name, nameSearch: normalize_arabic_search(name), section });

        res.status(201).json({
            success: true,
            data: student
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/students?section=boys|girls&search=...&active=true|false
async function get_students(req, res, next) {
    try {
        const filter = { section: require_section(req.query.section) };

        // نقبل النص فقط، حتى لا يُرسل أحدهم كائناً بدل النص داخل الاستعلام
        if (typeof req.query.search === "string" && req.query.search.trim() !== "") {
            filter.nameSearch = { $regex: normalize_arabic_search(req.query.search.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") };
        }

        if (req.query.active === "true") {
            filter.isActive = true;
        } else if (req.query.active === "false") {
            filter.isActive = false;
        } else if (req.query.active !== undefined && req.query.active !== "") {
            throw http_error(400, "قيمة active يجب أن تكون true أو false");
        }

        const paging = parse_pagination(req.query);
        if (!paging) throw http_error(400, "قيم limit وskip غير صالحة (الحد الأقصى للصفحة 100)");
        const [students, total] = await Promise.all([
            Student.find(filter).collation({ locale: "ar" }).sort({ name: 1, _id: 1 }).skip(paging.skip).limit(paging.limit),
            Student.countDocuments(filter)
        ]);
        res.status(200).json({ success: true, data: students, meta: { ...paging, total } });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/students/:id   (name و/أو isActive). القسم لا يتغير أبداً.
async function update_student(req, res, next) {
    try {
        if (!is_valid_id(req.params.id)) {
            throw http_error(400, "معرف الطالب غير صحيح");
        }

        const body = req.body || {};
        const updates = {};

        if (body.name !== undefined) {
            const name = clean_student_name(body.name);
            if (!name) {
                throw http_error(400, "اسم الطالب مطلوب ويجب ألا يزيد عن 100 حرف");
            }
            updates.name = name;
            updates.nameSearch = normalize_arabic_search(name);
        }

        if (body.isActive !== undefined) {
            if (typeof body.isActive !== "boolean") {
                throw http_error(400, "حالة الطالب يجب أن تكون true أو false");
            }
            updates.isActive = body.isActive;
        }

        if (Object.keys(updates).length === 0) {
            throw http_error(400, "لا توجد بيانات للتعديل");
        }

        // لا نلمس الجلسات هنا: تقييمات الطالب القديمة تبقى كما هي بالاسم القديم
        const student = await Student.findByIdAndUpdate(req.params.id, updates, {
            new: true,
            runValidators: true
        });

        if (!student) {
            throw http_error(404, "الطالب غير موجود");
        }

        res.status(200).json({
            success: true,
            data: student
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    create_student,
    get_students,
    update_student
};
