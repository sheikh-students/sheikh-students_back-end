function http_error(status_code, message) {
    const error = new Error(message);
    error.statusCode = status_code;
    error.expose_message = true;
    return error;
}

function not_found_handler(req, res) {
    res.status(404).json({ success: false, message: "المسار غير موجود" });
}

function method_not_allowed_handler(req, res) {
    const path = String(req.originalUrl || req.url).split("?")[0];
    let allowed = null;
    if (/^\/api\/(students|sessions|fields)\/?$/.test(path)) {
        allowed = path.startsWith("/api/students") ? "GET, POST" : path.startsWith("/api/sessions") ? "GET, POST" : "GET, POST";
    } else if (/^\/api\/(students|sessions|fields)\/[^/]+\/?$/.test(path)) {
        const base = path.split("/")[2];
        allowed = base === "sessions" ? "GET, PATCH, DELETE" : "PATCH";
    } else if (/^\/api\/sessions\/[^/]+\/report\/?$/.test(path)) {
        allowed = "GET";
    } else if (/^\/api\/(dashboard|meta|health)\/?$/.test(path)) {
        allowed = "GET";
    }
    if (!allowed) return not_found_handler(req, res);
    res.setHeader("Allow", allowed);
    res.status(405).json({ success: false, message: "طريقة الطلب غير مسموح بها لهذا المسار" });
}

function error_handler(error, req, res, next) {
    if (res.headersSent) return next(error);
    let status_code = 500;
    let message = "حدث خطأ في السيرفر";

    // أخطاء محلل الطلب تُفحص قبل statusCode لأن body-parser يضع statusCode أيضاً.
    if (error.type === "entity.parse.failed") {
        status_code = 400;
        message = "صيغة JSON غير صحيحة";
    } else if (error.type === "entity.too.large") {
        status_code = 413;
        message = "حجم البيانات المرسلة كبير جداً";
    } else if (error.type === "charset.unsupported") {
        status_code = 415;
        message = "ترميز النص المرسل غير مدعوم";
    } else if (error.type === "encoding.unsupported") {
        status_code = 415;
        message = "ترميز ضغط البيانات المرسلة غير مدعوم";
    } else if (error.expose_message === true && Number.isInteger(error.statusCode)) {
        status_code = error.statusCode;
        message = error.message;
    } else if (error.name === "ValidationError") {
        status_code = 400;
        // لا نعرض رسائل Mongoose الافتراضية لأنها قد تكون بالإنجليزية أو تكشف تفاصيل المخطط.
        message = "البيانات المرسلة غير صالحة";
    } else if (error.name === "CastError") {
        status_code = 400;
        message = "قيمة غير صحيحة في الطلب";
    } else if (/MongoNetwork|ServerSelection|MongooseServerSelection|MongoTimeout/.test(error.name || "")) {
        status_code = 503;
        message = "قاعدة البيانات غير متاحة حالياً، حاول بعد قليل";
    }

    if (status_code >= 500) {
        console.error(JSON.stringify({ level: "error", event: "request_error", name: error.name || "Error", status: status_code, path: req.path, method: req.method }));
    }
    res.status(status_code).json({ success: false, message });
}

module.exports = { http_error, not_found_handler, method_not_allowed_handler, error_handler };
