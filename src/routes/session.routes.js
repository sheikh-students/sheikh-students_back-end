const express = require("express");
const {
    create_session,
    get_sessions,
    get_session,
    patch_session,
    delete_session
} = require("../controllers/session.controller");
const { get_session_report } = require("../controllers/report.controller");

const router = express.Router();

router.post("/", create_session);
router.get("/", get_sessions);
router.get("/:id", get_session);
router.get("/:id/report", get_session_report);
router.patch("/:id", patch_session);
router.delete("/:id", delete_session);

module.exports = router;
