const mongoose = require("mongoose");
const { SECTIONS } = require("../config/constants");
const { normalize_arabic_search } = require("../utils/validate");

const studentSchema = new mongoose.Schema({
    name: { type: String, required: [true, "اسم الطالب مطلوب"], trim: true, maxlength: [100, "اسم الطالب طويل جداً"] },
    nameSearch: { type: String, default: "", index: true, select: false },
    section: { type: String, required: [true, "القسم مطلوب"], enum: { values: SECTIONS, message: "القسم غير صحيح" }, immutable: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

studentSchema.index({ section: 1, name: 1, _id: 1 }, { collation: { locale: "ar" } });
studentSchema.index({ section: 1, nameSearch: 1 });
studentSchema.pre("validate", function () {
    if (this.isModified("name") && typeof this.name === "string") this.nameSearch = normalize_arabic_search(this.name);
});
module.exports = mongoose.model("Student", studentSchema);
