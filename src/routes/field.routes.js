const express = require("express");
const { get_fields, create_field, update_field } = require("../controllers/field.controller");

const router = express.Router();

router.get("/", get_fields);
router.post("/", create_field);
router.patch("/:id", update_field);

module.exports = router;
