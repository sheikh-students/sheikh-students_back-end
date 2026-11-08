const zlib = require("zlib");
const express = require("express");
const { rateLimit } = require("express-rate-limit");

const student_routes = require("./routes/student.routes");
const session_routes = require("./routes/session.routes");
const dashboard_routes = require("./routes/dashboard.routes");
const field_routes = require("./routes/field.routes");
const meta_controller = require("./controllers/meta.controller");
const { error_handler, method_not_allowed_handler } = require("./middlewares/error.middleware");
const mongoose = require("mongoose");
const { create_host_middleware } = require("./middlewares/host.middleware");
const { create_cors_middleware } = require("./middlewares/cors.middleware");

const app = express();
app.disable("x-powered-by");

// إعداد عدد الوكلاء الموثوقين خلف Reverse Proxy. الافتراضي لا يثق بأي وكيل.
const trust_proxy = process.env.TRUST_PROXY;
if (trust_proxy !== undefined && trust_proxy !== "") {
    const parsed = /^\d+$/.test(trust_proxy) ? Number(trust_proxy) : trust_proxy === "true" ? 1 : trust_proxy === "false" ? false : trust_proxy;
    app.set("trust proxy", parsed);
} else {
    app.set("trust proxy", false);
}

// قائمة اختيارية لمنع Host غير المتوقع (مفيدة ضد DNS rebinding محلياً).
app.use(create_host_middleware(process.env.ALLOWED_HOSTS));

// رؤوس أمان لا تتطلب تسجيل دخول.
app.use(function (req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const enable_hsts = process.env.ENABLE_HSTS === "true" || (process.env.NODE_ENV === "production" && process.env.ENABLE_HSTS !== "false");
    if (enable_hsts) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
});

// ضغط gzip باستخدام zlib من Node.js حتى لا نضيف مكتبة ضغط ثانية.
app.use(function gzip_middleware(req, res, next) {
    const accepts_gzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
    if (!accepts_gzip || req.method === "HEAD") return next();
    const original_write = res.write.bind(res);
    const original_end = res.end.bind(res);
    let gzip = null;
    let started = false;
    let ended = false;
    function prepare() {
        if (started) return;
        started = true;
        const content_type = String(res.getHeader("Content-Type") || "");
        const already_encoded = res.getHeader("Content-Encoding");
        if (!/^(text\/|application\/(json|javascript|xml)|image\/svg\+xml)/i.test(content_type) || already_encoded || res.statusCode === 204 || res.statusCode === 304) {
            started = false;
            return;
        }
        gzip = zlib.createGzip();
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Vary", "Accept-Encoding");
        res.removeHeader("Content-Length");
        gzip.on("data", (chunk) => original_write(chunk));
        gzip.on("end", () => { if (!ended) { ended = true; original_end(); } });
        gzip.on("error", () => { if (!res.headersSent) res.statusCode = 500; original_end(); });
    }
    res.write = function (chunk, encoding, callback) {
        prepare();
        return gzip ? gzip.write(chunk, encoding, callback) : original_write(chunk, encoding, callback);
    };
    res.end = function (chunk, encoding, callback) {
        prepare();
        if (!gzip) return original_end(chunk, encoding, callback);
        if (chunk !== undefined && chunk !== null) gzip.end(chunk, encoding, callback);
        else gzip.end(callback);
        return res;
    };
    next();
});

// سجل خفيف لا يكتب أجسام الطلبات أو أسماء الطلاب.
app.use(function request_logger(req, res, next) {
    const started = process.hrtime.bigint();
    res.on("finish", function () {
        const elapsed_ms = Number(process.hrtime.bigint() - started) / 1e6;
        console.log(JSON.stringify({ level: "info", event: "http_request", method: req.method, path: req.path, status: res.statusCode, duration_ms: Math.round(elapsed_ms) }));
    });
    next();
});

const api_limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Math.max(1, Number(process.env.API_RATE_LIMIT_MAX) || 600),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "تم تجاوز عدد الطلبات المسموح به، حاول بعد قليل" },
    handler: (req, res) => res.status(429).json({ success: false, message: "تم تجاوز عدد الطلبات المسموح به، حاول بعد قليل" })
});
const write_limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Math.max(1, Number(process.env.API_WRITE_RATE_LIMIT_MAX) || 120),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => !["POST", "PATCH", "PUT", "DELETE"].includes(req.method),
    handler: (req, res) => res.status(429).json({ success: false, message: "تم تجاوز عدد عمليات التعديل المسموح بها، حاول بعد قليل" })
});
app.use("/api", create_cors_middleware(process.env.CORS_ORIGINS, process.env.CORS_ALLOW_CREDENTIALS === "true"));
app.use("/api", api_limiter, write_limiter);

app.use(express.json({ limit: "50kb", strict: true }));

// أي طلب API أثناء انقطاع MongoDB يرجع 503 بدلاً من الانتظار.
app.use("/api", function database_availability(req, res, next) {
    if (req.path === "/health") return next();
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ success: false, message: "قاعدة البيانات غير متاحة حالياً، حاول بعد قليل" });
    }
    next();
});
app.use("/api", function (req, res, next) {
    res.setHeader("Cache-Control", "no-store");
    next();
});

app.get("/api/health", meta_controller.get_health);
app.get("/api/meta", meta_controller.get_meta);
app.use("/api/students", student_routes);
app.use("/api/fields", field_routes);
app.use("/api/sessions", session_routes);
app.use("/api/dashboard", dashboard_routes);
app.use("/api", method_not_allowed_handler);

// هذا السيرفر مخصص للـ API فقط؛ تُنشر ملفات الواجهة من public/ بشكل مستقل.
app.use(function (req, res) {
    res.status(404).json({ success: false, message: "الصفحة غير موجودة" });
});
app.use(error_handler);
module.exports = app;