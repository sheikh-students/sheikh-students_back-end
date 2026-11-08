// الثوابت المشتركة بين الـ API والبيانات.
const SECTIONS = ["boys", "girls"];
const GRADES = ["ممتاز", "جيد جداً", "جيد", "يحتاج مراجعة", "إعادة"];
const FIELD_KINDS = ["text", "range"];
const DEFAULT_FIELDS = [
    { name: "الجديد", kind: "text" },
    { name: "المراجعة", kind: "text" },
    { name: "الأحاديث", kind: "range" },
    { name: "التحفة (الجزرية)", kind: "range" }
];
const MAX_FIELDS_PER_SECTION = 20;
const MAX_EVALUATIONS_PER_SESSION = 500;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const MAX_SESSION_RANGE_DAYS = 31;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

module.exports = {
    SECTIONS,
    GRADES,
    FIELD_KINDS,
    DEFAULT_FIELDS,
    MAX_FIELDS_PER_SECTION,
    MAX_EVALUATIONS_PER_SESSION,
    MIN_YEAR,
    MAX_YEAR,
    MAX_SESSION_RANGE_DAYS,
    DEFAULT_PAGE_LIMIT,
    MAX_PAGE_LIMIT
};
