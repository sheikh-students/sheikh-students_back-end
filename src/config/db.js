const mongoose = require("mongoose");

let listeners_attached = false;
function attach_connection_listeners() {
    if (listeners_attached) return;
    listeners_attached = true;
    mongoose.connection.on("disconnected", function () {
        console.error("[قاعدة البيانات] انقطع الاتصال");
    });
    mongoose.connection.on("reconnected", function () {
        console.log("[قاعدة البيانات] عاد الاتصال");
    });
    mongoose.connection.on("connected", function () {
        console.log("[قاعدة البيانات] الاتصال نشط");
    });
    mongoose.connection.on("error", function (error) {
        console.error("[قاعدة البيانات] خطأ اتصال:", error.name || "DatabaseError");
    });
}

async function connect_db(uri) {
    if (!uri) throw new Error("رابط قاعدة البيانات غير موجود. تأكد من ملف .env");
    attach_connection_listeners();
    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 20,
        minPoolSize: 0,
        waitQueueTimeoutMS: 10000
    });
    console.log("تم الاتصال بقاعدة البيانات");
}

module.exports = connect_db;
