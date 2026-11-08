const Field = require("../models/field.model");
const Counter = require("../models/counter.model");
const { DEFAULT_FIELDS } = require("../config/constants");

async function ensure_counter_max(name, value) {
    try {
        await Counter.updateOne({ name }, { $max: { value } }, { upsert: true });
    } catch (error) {
        if (error && error.code === 11000) await Counter.updateOne({ name }, { $max: { value } });
        else throw error;
    }
}

async function ensure_default_fields(section) {
    const count = await Field.countDocuments({ section });
    if (count === 0) {
        const docs = DEFAULT_FIELDS.map((item, index) => ({ name: item.name, kind: item.kind, section, order: index + 1 }));
        try {
            await Field.insertMany(docs, { ordered: false });
        } catch (error) {
            const duplicate_only = error && (error.code === 11000 ||
                (Array.isArray(error.writeErrors) && error.writeErrors.every((item) => item.err && item.err.code === 11000)));
            if (!duplicate_only) throw error;
        }
    }
    const last = await Field.findOne({ section }).sort({ order: -1, _id: -1 }).select("order").lean();
    await ensure_counter_max("field-order:" + section, last ? last.order : 0);
    const current_count = await Field.countDocuments({ section });
    await ensure_counter_max("field-count:" + section, current_count);
}

async function reserve_field_slot(section, maximum) {
    const counter = await Counter.findOneAndUpdate(
        { name: "field-count:" + section, value: { $lt: maximum } },
        { $inc: { value: 1 } },
        { new: true }
    );
    return Boolean(counter);
}

async function release_field_slot(section) {
    await Counter.updateOne({ name: "field-count:" + section, value: { $gt: 0 } }, { $inc: { value: -1 } });
}

async function next_field_order(section) {
    const counter = await Counter.findOneAndUpdate(
        { name: "field-order:" + section },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return counter.value;
}

module.exports = { ensure_default_fields, next_field_order, reserve_field_slot, release_field_slot };
