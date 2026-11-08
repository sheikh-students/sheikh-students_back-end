const Student = require("../models/student.model");
const Session = require("../models/session.model");
const { require_section } = require("../utils/section");

// GET /api/dashboard?section=boys|girls
async function get_dashboard(req, res, next) {
    try {
        const section = require_section(req.query.section);

        const active_students = await Student.countDocuments({ section: section, isActive: true });
        const total_sessions = await Session.countDocuments({ section: section });
        const latest_sessions = await Session.list_summaries(section, 5);

        res.status(200).json({
            success: true,
            data: {
                activeStudents: active_students,
                totalSessions: total_sessions,
                latestSessions: latest_sessions
            }
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    get_dashboard
};
