// CORS للواجهة المستضافة على نطاق منفصل. لا يستخدم Cookies أو جلسات.
function create_cors_middleware(allowed_origins, allow_credentials) {
    const origins = new Set(
        String(allowed_origins || "")
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean)
    );

    return function cors_middleware(req, res, next) {
        const origin = req.headers.origin;
        if (!origin) return next();

        // طلبات نفس الأصل لا تحتاج CORS حتى لو لم تضف النطاق إلى القائمة.
        let same_origin;

        try {
            const parsed_origin = new URL(origin);
            const request_protocol = String(req.protocol || "http").replace(/:$/, "");
            const request_host = String(req.headers.host || "").toLowerCase();

            same_origin = parsed_origin.protocol === request_protocol + ":"
                && parsed_origin.host.toLowerCase() === request_host;
        } catch {
            same_origin = false;
        }

        if (!same_origin && !origins.has(origin)) {
            return res.status(403).json({
                success: false,
                message: "مصدر الطلب غير مسموح به"
            });
        }

        if (!same_origin) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");
            res.setHeader("Access-Control-Max-Age", "86400");
            if (allow_credentials === true) {
                res.setHeader("Access-Control-Allow-Credentials", "true");
            }
            if (typeof res.vary === "function") res.vary("Origin");
            else res.setHeader("Vary", "Origin");
        }

        if (req.method === "OPTIONS") return res.status(204).end();
        next();
    };
}

module.exports = { create_cors_middleware };
