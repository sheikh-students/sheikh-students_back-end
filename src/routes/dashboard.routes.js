const express = require("express");
const { get_dashboard } = require("../controllers/dashboard.controller");

const router = express.Router();

router.get("/", get_dashboard);

module.exports = router;
