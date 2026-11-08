const mongoose = require("mongoose");
const { SECTIONS, FIELD_KINDS } = require("../config/constants");

const fieldSchema = new mongoose.Schema({
    name: { type: String, required: [true, "اسم القسم مطلوب"], trim: true, maxlength: [40, "اسم القسم طويل جداً"] },
    section: { type: String, required: [true, "القسم مطلوب"], enum: { values: SECTIONS, message: "القسم غير صحيح" }, immutable: true },
    kind: { type: String, required: [true, "نوع القسم مطلوب"], enum: { values: FIELD_KINDS, message: "نوع القسم غير صحيح" }, immutable: true },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
}, { timestamps: true });

fieldSchema.index({ section: 1, name: 1 }, { unique: true });
fieldSchema.index({ section: 1, order: 1, _id: 1 });
module.exports = mongoose.model("Field", fieldSchema);
