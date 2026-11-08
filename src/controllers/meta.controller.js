const { SECTIONS, GRADES, FIELD_KINDS, MAX_FIELDS_PER_SECTION, MAX_EVALUATIONS_PER_SESSION, MAX_SESSION_RANGE_DAYS, MIN_YEAR, MAX_YEAR, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } = require("../config/constants");

function get_meta(req, res) {
    res.status(200).json({
        success: true,
        data: {
            sections: SECTIONS,
            grades: GRADES,
            fieldKinds: FIELD_KINDS,
            limits: {
                fieldsPerSection: MAX_FIELDS_PER_SECTION,
                evaluationsPerSession: MAX_EVALUATIONS_PER_SESSION,
                sessionRangeDays: MAX_SESSION_RANGE_DAYS,
                minYear: MIN_YEAR,
                maxYear: MAX_YEAR,
                defaultPageLimit: DEFAULT_PAGE_LIMIT,
                maxPageLimit: MAX_PAGE_LIMIT
            }
        }
    });
}

function get_health(req, res) {
    const mongoose = require("mongoose");
    const connected = mongoose.connection.readyState === 1;
    if (!connected) return res.status(503).json({ success: false, message: "قاعدة البيانات غير متاحة حالياً" });
    return res.status(200).json({ success: true, data: { status: "ok", database: "connected" } });
}
module.exports = { get_meta, get_health };
