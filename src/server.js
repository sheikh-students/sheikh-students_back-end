require("dotenv").config();

const mongoose = require("mongoose");
const app = require("./app");
const connect_db = require("./config/db");
const { migrate_legacy_data } = require("./config/migrate");
const models = [
    require("./models/student.model"),
    require("./models/field.model"),
    require("./models/session.model"),
    require("./models/counter.model"),
    require("./models/schema-migration.model")
];

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
let server = null;
let shutting_down = false;

async function close_server(exit_code) {
    if (shutting_down) return;
    shutting_down = true;
    const force_exit = setTimeout(function () {
        console.error("انتهت مهلة الإغلاق الآمن (10 ثوانٍ)");
        process.exit(exit_code);
    }, 10000);
    force_exit.unref();
    try {
        if (server && server.listening) {
            await new Promise((resolve) => server.close(resolve));
        }
        if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
        clearTimeout(force_exit);
        process.exit(exit_code);
    } catch (error) {
        console.error("فشل الإغلاق الآمن:", error.name || "ShutdownError");
        process.exit(1);
    }
}

async function start_server() {
    try {
        if (process.env.NODE_ENV === "production" && HOST === "0.0.0.0") {
            console.warn("تحذير أمني: الموقع بلا تسجيل دخول أو حماية داخلية. ربطه بـ 0.0.0.0 يكشف بيانات الطلاب؛ لا تنشره إلا خلف Cloudflare Access أو VPN أو Reverse Proxy محمي.");
        }
        await connect_db(process.env.MONGODB_URI);
        await migrate_legacy_data();
        // لا يبدأ استقبال الطلبات قبل نجاح بناء جميع الفهارس (ومنها الفهارس الفريدة).
        await Promise.all(models.map((model) => model.init()));
        server = app.listen(PORT, HOST, function () {
            console.log("الموقع يعمل على " + HOST + ":" + PORT);
        });
        server.on("error", function (error) {
            console.error("تعذر فتح المنفذ " + PORT + ": " + (error.code || error.name));
            close_server(1);
        });
    } catch (error) {
        if (error && error.code === 11000) {
            console.error("فشل بناء فهرس فريد في MongoDB؛ راجع وجود قيم مكررة قبل تشغيل السيرفر.");
        }
        console.error("تعذر تشغيل السيرفر:", error.name || "StartupError", error.code || "");
        await close_server(1);
    }
}

process.on("SIGTERM", () => close_server(0));
process.on("SIGINT", () => close_server(0));
process.on("unhandledRejection", (reason) => {
    console.error("خطأ غير معالج في Promise:", reason && reason.name ? reason.name : "UnhandledRejection");
    close_server(1);
});
process.on("uncaughtException", (error) => {
    console.error("خطأ غير معالج أوقف العملية:", error.name || "UncaughtException");
    close_server(1);
});

start_server();
