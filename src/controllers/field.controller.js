const Field = require("../models/field.model");
const { FIELD_KINDS, MAX_FIELDS_PER_SECTION } = require("../config/constants");
const { http_error } = require("../middlewares/error.middleware");
const { is_valid_id, clean_field_name } = require("../utils/validate");
const { require_section } = require("../utils/section");
const { ensure_default_fields, next_field_order, reserve_field_slot, release_field_slot } = require("../utils/fields");

const NAME_ERROR = "اسم القسم مطلوب ويجب ألا يزيد عن 40 حرفاً";
const DUPLICATE_ERROR = "يوجد قسم متابعة بنفس الاسم";
function is_duplicate_key(error) { return Boolean(error) && error.code === 11000; }

async function get_fields(req, res, next) {
    try {
        const section = require_section(req.query.section);
        await ensure_default_fields(section);
        const filter = { section };
        if (req.query.active === "true") filter.isActive = true;
        else if (req.query.active !== undefined && req.query.active !== "") throw http_error(400, "قيمة active يجب أن تكون true");
        const fields = await Field.find(filter).sort({ order: 1, _id: 1 });
        res.status(200).json({ success: true, data: fields });
    } catch (error) { next(error); }
}

async function create_field(req, res, next) {
    try {
        const body = req.body || {};
        const section = require_section(body.section);
        const name = clean_field_name(body.name);
        if (!name) throw http_error(400, NAME_ERROR);
        if (!FIELD_KINDS.includes(body.kind)) throw http_error(400, "نوع القسم يجب أن يكون text أو range");
        await ensure_default_fields(section);
        const slot_reserved = await reserve_field_slot(section, MAX_FIELDS_PER_SECTION);
        if (!slot_reserved) throw http_error(409, "وصلت إلى الحد الأقصى لأقسام المتابعة (20 قسماً)");
        let field;
        try {
            const order = await next_field_order(section);
            field = await Field.create({ name, section, kind: body.kind, order });
        } catch (error) {
            await release_field_slot(section);
            if (is_duplicate_key(error)) throw http_error(409, DUPLICATE_ERROR);
            throw error;
        }
        res.status(201).json({ success: true, data: field });
    } catch (error) { next(error); }
}

async function update_field(req, res, next) {
    try {
        if (!is_valid_id(req.params.id)) throw http_error(400, "معرف القسم غير صحيح");
        const body = req.body || {};
        const updates = {};
        if (body.name !== undefined) {
            const name = clean_field_name(body.name);
            if (!name) throw http_error(400, NAME_ERROR);
            updates.name = name;
        }
        if (body.isActive !== undefined) {
            if (typeof body.isActive !== "boolean") throw http_error(400, "حالة القسم يجب أن تكون true أو false");
            updates.isActive = body.isActive;
        }
        if (body.move !== undefined && body.move !== "up" && body.move !== "down") throw http_error(400, "الحركة يجب أن تكون up أو down");
        if (!Object.keys(updates).length && body.move === undefined) throw http_error(400, "لا توجد بيانات للتعديل");

        let field = await Field.findById(req.params.id);
        if (!field) throw http_error(404, "القسم غير موجود");
        if (Object.keys(updates).length) {
            try { field = await Field.findByIdAndUpdate(field._id, updates, { new: true, runValidators: true }); }
            catch (error) {
                if (is_duplicate_key(error)) throw http_error(409, DUPLICATE_ERROR);
                throw error;
            }
        }
        if (body.move !== undefined) {
            await ensure_default_fields(field.section);
            // ترتيب ثابت (order ثم _id)، وتُرسل كل التغييرات في bulkWrite واحد.
            const all = await Field.find({ section: field.section }).sort({ order: 1, _id: 1 });
            const index = all.findIndex((item) => String(item._id) === String(field._id));
            const target = body.move === "up" ? index - 1 : index + 1;
            if (index >= 0 && target >= 0 && target < all.length) {
                [all[index], all[target]] = [all[target], all[index]];
                await Field.bulkWrite(all.map((item, position) => ({
                    updateOne: { filter: { _id: item._id, section: field.section }, update: { $set: { order: position + 1, updatedAt: new Date() } } }
                })), { ordered: true });
                await require("../models/counter.model").updateOne({ name: "field-order:" + field.section }, { $max: { value: all.length } }, { upsert: true });
            }
            field = await Field.findById(field._id);
        }
        res.status(200).json({ success: true, data: field });
    } catch (error) { next(error); }
}

module.exports = { get_fields, create_field, update_field };
