const mongoose = require("mongoose");
const { SECTIONS, GRADES, MAX_EVALUATIONS_PER_SESSION } = require("../config/constants");
const {
    is_valid_date,
    MATERIAL_MAX_LENGTH,
    ENTRY_CONTENT_MAX_LENGTH,
    ENTRY_RANGE_MAX_LENGTH
} = require("../utils/validate");

const entrySchema = new mongoose.Schema({
    fieldId: { type: mongoose.Schema.Types.ObjectId, ref: "Field", required: [true, "معرف القسم مطلوب"] },
    fieldName: { type: String, required: [true, "اسم القسم مطلوب"], trim: true },
    content: { type: String, trim: true, default: "", maxlength: [ENTRY_CONTENT_MAX_LENGTH, "النص طويل جداً"] },
    from: { type: String, trim: true, default: "", maxlength: [ENTRY_RANGE_MAX_LENGTH, "النص طويل جداً"] },
    to: { type: String, trim: true, default: "", maxlength: [ENTRY_RANGE_MAX_LENGTH, "النص طويل جداً"] },
    grade: { type: String, default: "", enum: { values: GRADES.concat([""]), message: "التقدير غير مسموح به" } }
}, { timestamps: true });

const evaluationSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: [true, "معرف الطالب مطلوب"] },
    studentName: { type: String, required: [true, "اسم الطالب مطلوب"], trim: true },
    entries: { type: [entrySchema], default: [] },
    material: { type: String, trim: true, maxlength: [MATERIAL_MAX_LENGTH, "مادة الحفظ / المراجعة طويلة جداً"] },
    grade: { type: String, enum: { values: GRADES, message: "التقدير غير مسموح به" } }
}, { timestamps: true });

evaluationSchema.path("entries").validate(function (entries) {
    return !entries || entries.length <= 20;
}, "عدد خانات التقييم تجاوز الحد المسموح");

const sessionSchema = new mongoose.Schema({
    title: { type: String, trim: true, maxlength: [150, "عنوان الجلسة طويل جداً"], default: "" },
    section: { type: String, required: [true, "القسم مطلوب"], enum: { values: SECTIONS, message: "القسم غير صحيح" }, immutable: true },
    date: { type: String, required: [true, "تاريخ الجلسة مطلوب"], validate: { validator: is_valid_date, message: "التاريخ يجب أن يكون بصيغة YYYY-MM-DD" } },
    endDate: { type: String, default: "", validate: { validator: function (value) { return value === "" || is_valid_date(value); }, message: "تاريخ النهاية يجب أن يكون بصيغة YYYY-MM-DD" } },
    evaluations: { type: [evaluationSchema], default: [] },
    evaluationsCount: { type: Number, default: 0, min: 0, max: MAX_EVALUATIONS_PER_SESSION }
}, { timestamps: true });

sessionSchema.path("evaluations").validate(function (items) {
    return !items || items.length <= MAX_EVALUATIONS_PER_SESSION;
}, "عدد التقييمات في الجلسة تجاوز الحد الأقصى وهو 500");
sessionSchema.index({ section: 1, date: -1, createdAt: -1, _id: -1 });

sessionSchema.statics.list_summaries = function (section, limit, skip) {
    const steps = [
        { $match: { section } },
        { $sort: { date: -1, createdAt: -1, _id: -1 } }
    ];
    if (skip) steps.push({ $skip: skip });
    if (limit) steps.push({ $limit: limit });
    steps.push({
        $project: {
            title: 1, date: 1, endDate: 1, section: 1, createdAt: 1, updatedAt: 1,
            evaluationsCount: { $ifNull: ["$evaluationsCount", 0] }
        }
    });
    return this.aggregate(steps);
};

module.exports = mongoose.model("Session", sessionSchema);
