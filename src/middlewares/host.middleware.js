function create_host_middleware(value) {
    const allowed_hosts = (Array.isArray(value) ? value : String(value || "").split(","))
        .map((host) => String(host).trim().toLowerCase()).filter(Boolean);
    return function host_filter(req, res, next) {
        if (allowed_hosts.length && !allowed_hosts.includes(String(req.hostname || "").toLowerCase())) {
            return res.status(403).json({ success: false, message: "اسم المضيف غير مسموح به" });
        }
        next();
    };
}
module.exports = { create_host_middleware };
