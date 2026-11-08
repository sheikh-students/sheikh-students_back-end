const mongoose = require("mongoose");
const schema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    value: { type: Number, required: true, default: 0 }
}, { versionKey: false });
module.exports = mongoose.model("Counter", schema);
