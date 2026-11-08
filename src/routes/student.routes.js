const express = require("express");
const { create_student, get_students, update_student } = require("../controllers/student.controller");

const router = express.Router();

router.post("/", create_student);
router.get("/", get_students);
router.patch("/:id", update_student);

module.exports = router;
