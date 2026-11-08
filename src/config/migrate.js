const mongoose = require("mongoose");
const crypto = require("crypto");
const Student = require("../models/student.model");
const Session = require("../models/session.model");
const SchemaMigration = require("../models/schema-migration.model");
const { normalize_arabic_search } = require("../utils/validate");
const { ensure_default_fields } = require("../utils/fields");

// إصدار جديد لأن هذه الخطوة تضيف تهيئة الأعمدة الافتراضية للنسخ الموجودة بالفعل.
const MIGRATION_ID = "2026-11-08-legacy-evaluations-arabic-search-counts-default-fields-v3";

async function perform_migrations() {
    // الطلاب والجلسات القديمة التي لم يكن لها قسم تنقل إلى قسم الأولاد.
    const students = await Student.collection.updateMany(
        { section: { $exists: false } },
        { $set: { section: "boys" } }
    );
    const sessions = await Session.collection.updateMany(
        { section: { $exists: false } },
        { $set: { section: "boys" } }
    );

    // يطابق التقييم القديم فعلاً: وجود subject أو notes وغياب entries.
    // لا يمس أي تقييم جديد بنظام entries حتى لو لم يحتوِ material.
    const old_text = {
        $trim: {
            input: {
                $concat: [
                    { $ifNull: ["$$item.subject", ""] },
                    {
                        $cond: [
                            { $gt: [{ $strLenCP: { $ifNull: ["$$item.notes", ""] } }, 0] },
                            { $concat: [": ", "$$item.notes"] },
                            ""
                        ]
                    }
                ]
            }
        }
    };
    const evaluations = await Session.collection.updateMany(
        {
            evaluations: {
                $elemMatch: {
                    entries: { $exists: false },
                    $or: [{ subject: { $exists: true } }, { notes: { $exists: true } }]
                }
            }
        },
        [{
            $set: {
                evaluations: {
                    $map: {
                        input: { $ifNull: ["$evaluations", []] },
                        as: "item",
                        in: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: [{ $type: "$$item.entries" }, "missing"] },
                                        {
                                            $or: [
                                                { $ne: [{ $type: "$$item.subject" }, "missing"] },
                                                { $ne: [{ $type: "$$item.notes" }, "missing"] }
                                            ]
                                        }
                                    ]
                                },
                                { $mergeObjects: ["$$item", { material: { $ifNull: ["$$item.material", old_text] } }] },
                                "$$item"
                            ]
                        }
                    }
                }
            }
        }]
    );

    // ملء updatedAt للسجلات القديمة، بما فيها التقييمات والخانات الفرعية.
    const now = new Date();
    await Student.collection.updateMany({ updatedAt: { $exists: false } }, [{ $set: { updatedAt: { $ifNull: ["$createdAt", now] } } }]);
    await Session.collection.updateMany({ updatedAt: { $exists: false } }, [{ $set: { updatedAt: { $ifNull: ["$createdAt", now] } } }]);
    const Field = require("../models/field.model");
    await Field.collection.updateMany({ updatedAt: { $exists: false } }, [{ $set: { updatedAt: { $ifNull: ["$createdAt", now] } } }]);
    await Field.collection.updateMany({ isActive: { $exists: false } }, { $set: { isActive: true } });
    await Session.collection.updateMany(
        { evaluations: { $exists: true, $ne: [] } },
        [{
            $set: {
                evaluations: {
                    $map: {
                        input: "$evaluations", as: "ev",
                        in: {
                            $mergeObjects: ["$$ev", {
                                updatedAt: { $ifNull: ["$$ev.updatedAt", { $ifNull: ["$$ev.createdAt", now] }] },
                                entries: {
                                    $map: {
                                        input: { $ifNull: ["$$ev.entries", []] }, as: "entry",
                                        in: { $mergeObjects: ["$$entry", { updatedAt: { $ifNull: ["$$entry.updatedAt", { $ifNull: ["$$entry.createdAt", now] }] } }] }
                                    }
                                }
                            }]
                        }
                    }
                }
            }
        }]
    );

    // backfill لعدد التقييمات؛ بعده لا تحتاج قائمة الجلسات إلى قراءة المصفوفات.
    await Session.collection.updateMany(
        { evaluationsCount: { $exists: false } },
        [{ $set: { evaluationsCount: { $size: { $ifNull: ["$evaluations", []] } } } }]
    );

    // ملء حقل البحث العربي على دفعات لتجنب تحميل مجموعة الطلاب كاملة في الذاكرة.
    const cursor = Student.collection.find({ $or: [{ nameSearch: { $exists: false } }, { nameSearch: "" }] }).project({ _id: 1, name: 1 });
    let batch = [];
    for await (const student of cursor) {
        batch.push({ updateOne: { filter: { _id: student._id }, update: { $set: { nameSearch: normalize_arabic_search(student.name || "") } } } });
        if (batch.length >= 500) {
            await Student.collection.bulkWrite(batch, { ordered: false });
            batch = [];
        }
    }
    if (batch.length) await Student.collection.bulkWrite(batch, { ordered: false });

    // إنشاء أعمدة المتابعة الافتراضية للقسمين أثناء التهيئة الأولى.
    // الدالة آمنة للتكرار والتزامن وتحدّث عدّادات الترتيب والحد الأقصى.
    await Promise.all(["boys", "girls"].map((section) => ensure_default_fields(section)));

    if (students.modifiedCount || sessions.modifiedCount || evaluations.modifiedCount) {
        console.log("اكتمل ترحيل البيانات القديمة");
    }
}

async function migrate_legacy_data() {
    const owner = crypto.randomUUID();
    const now = new Date();
    try {
        await SchemaMigration.findOneAndUpdate(
            { _id: MIGRATION_ID },
            { $setOnInsert: { status: "pending", owner: "", lockExpiresAt: new Date(0) } },
            { upsert: true, new: true }
        );
    } catch (error) {
        // قد يسبقنا تشغيل متزامن إلى إنشاء سجل الترحيل ذي _id نفسه.
        if (!error || error.code !== 11000) throw error;
    }

    const claimed = await SchemaMigration.findOneAndUpdate(
        {
            _id: MIGRATION_ID,
            $or: [
                { status: "pending" },
                { status: "failed" },
                { status: "running", lockExpiresAt: { $lt: now } }
            ]
        },
        { $set: { status: "running", owner, lockExpiresAt: new Date(Date.now() + 3 * 60 * 1000), errorMessage: "" } },
        { new: true }
    );

    if (!claimed) {
        // نسخة أخرى من التطبيق تنفذ الترحيل؛ ننتظر نتيجتها بدلاً من تنفيذ متزامن.
        for (let attempt = 0; attempt < 60; attempt += 1) {
            const current = await SchemaMigration.findById(MIGRATION_ID).lean();
            if (current && current.status === "done") return;
            if (!current || current.status === "failed" || (current.lockExpiresAt && current.lockExpiresAt < new Date())) break;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        const current = await SchemaMigration.findById(MIGRATION_ID).lean();
        if (current && current.status === "done") return;
        throw new Error("تعذر الحصول على قفل ترحيل البيانات بأمان");
    }

    const heartbeat = setInterval(function () {
        SchemaMigration.updateOne(
            { _id: MIGRATION_ID, owner },
            { $set: { lockExpiresAt: new Date(Date.now() + 3 * 60 * 1000) } }
        ).catch((error) => console.error("تعذر تجديد قفل الترحيل:", error.name || "MigrationLockError"));
    }, 30000);
    if (typeof heartbeat.unref === "function") heartbeat.unref();
    try {
        await perform_migrations();
        clearInterval(heartbeat);
        await SchemaMigration.updateOne(
            { _id: MIGRATION_ID, owner },
            { $set: { status: "done", completedAt: new Date(), lockExpiresAt: null, owner: "" } }
        );
    } catch (error) {
        clearInterval(heartbeat);
        await SchemaMigration.updateOne(
            { _id: MIGRATION_ID, owner },
            { $set: { status: "failed", errorMessage: String(error.message || "فشل الترحيل").slice(0, 300), lockExpiresAt: new Date(0), owner: "" } }
        );
        throw error;
    }
}

module.exports = { migrate_legacy_data, perform_migrations, MIGRATION_ID };