const { http_error } = require("../middlewares/error.middleware");
const { is_valid_section } = require("./validate");

// القسم (boys أو girls) مطلوب في كل طلب يقرأ أو يُنشئ طلاباً أو جلسات،
// حتى لا تختلط بيانات الأولاد والبنات أبداً.
function require_section(value) {
    if (!is_valid_section(value)) {
        throw http_error(400, "القسم مطلوب ويجب أن يكون boys أو girls");
    }
    return value;
}

module.exports = {
    require_section
};
