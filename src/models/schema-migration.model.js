const mongoose = require("mongoose");
const schema = new mongoose.Schema({
    _id: { type: String },
    status: { type: String, enum: ["pending", "running", "done", "failed"], default: "pending" },
    owner: { type: String, default: "" },
    lockExpiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    errorMessage: { type: String, default: "" }
}, { versionKey: false, collection: "schema_migrations" });
module.exports = mongoose.model("SchemaMigration", schema);
