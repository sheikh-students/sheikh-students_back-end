// دوال تحقق وتنظيف مشتركة، دون الاعتماد على مكتبات إضافية.
const { SECTIONS, GRADES, MIN_YEAR, MAX_YEAR, MAX_SESSION_RANGE_DAYS, MAX_FIELDS_PER_SECTION, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } = require("../config/constants");

const NAME_MAX_LENGTH = 100;
const TITLE_MAX_LENGTH = 150;
const MATERIAL_MAX_LENGTH = 600;
const FIELD_NAME_MAX_LENGTH = 40;
const ENTRY_CONTENT_MAX_LENGTH = 300;
const ENTRY_RANGE_MAX_LENGTH = 100;
const MAX_ENTRIES = MAX_FIELDS_PER_SECTION;

function normalize_clean_text(value, allow_newlines) {
    // إزالة محارف التحكم والاتجاه والمحارف عديمة العرض، مع توحيد Unicode إلى NFC.
    let text = String(value).normalize("NFC")
        .replace(/[\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
        // eslint-disable-next-line no-control-regex -- Intentionally removes control characters from user input.
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    if (allow_newlines) {
        text = text.replace(/\r\n?/g, "\n");
    } else {
        text = text.replace(/[\r\n]+/g, " ");
    }
    return text;
}

function normalize_arabic_search(value) {
    return normalize_clean_text(String(value || ""), false)
        .normalize("NFD")
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .normalize("NFC")
        .replace(/\s+/g, " ").trim()
        .toLocaleLowerCase("en");
}

function is_valid_id(value) {
    return typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);
}

function is_valid_section(value) {
    return typeof value === "string" && SECTIONS.includes(value);
}

function is_valid_date(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const year = Number(value.slice(0, 4));
    if (year < MIN_YEAR || year > MAX_YEAR) return false;
    const date = new Date(value + "T00:00:00Z");
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function is_valid_date_range(start, end) {
    if (!is_valid_date(start) || !is_valid_date(end) || end < start) return false;
    const days = (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000;
    return days <= MAX_SESSION_RANGE_DAYS;
}

function clean_student_name(value) {
    if (typeof value !== "string") return null;
    const name = normalize_clean_text(value, false).trim().replace(/\s+/g, " ");
    return name.length > 0 && name.length <= NAME_MAX_LENGTH ? name : null;
}

function clean_title(value) {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") return null;
    const title = normalize_clean_text(value, false).trim().replace(/\s+/g, " ");
    return title.length <= TITLE_MAX_LENGTH ? title : null;
}

function clean_material(value) {
    if (typeof value !== "string") return null;
    const material = normalize_clean_text(value, true).split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .filter((line) => line.length > 0).join("\n");
    return material.length > 0 && material.length <= MATERIAL_MAX_LENGTH ? material : null;
}

function clean_field_name(value) {
    if (typeof value !== "string") return null;
    const name = normalize_clean_text(value, false).trim().replace(/\s+/g, " ");
    return name.length > 0 && name.length <= FIELD_NAME_MAX_LENGTH ? name : null;
}

function clean_optional_text(value, max_length, keep_lines) {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") return null;
    const text = normalize_clean_text(value, Boolean(keep_lines)).split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .filter((line) => line.length > 0)
        .join(keep_lines ? "\n" : " ");
    return text.length <= max_length ? text : null;
}

// يتحقق من الطول بعد تجاهل الخانات الفارغة حتى لا تُرفض طلبات الواجهة التي ترسل جميع الأعمدة.
function clean_entries(value) {
    if (!Array.isArray(value) || value.length === 0) return null;
    const seen = new Set();
    const result = [];
    for (const item of value) {
        if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
        if (!is_valid_id(item.fieldId) || seen.has(item.fieldId)) return null;
        seen.add(item.fieldId);
        const content = clean_optional_text(item.content, ENTRY_CONTENT_MAX_LENGTH, true);
        const from = clean_optional_text(item.from, ENTRY_RANGE_MAX_LENGTH, false);
        const to = clean_optional_text(item.to, ENTRY_RANGE_MAX_LENGTH, false);
        if (content === null || from === null || to === null) return null;
        let grade = "";
        if (item.grade !== undefined && item.grade !== null && item.grade !== "") {
            if (typeof item.grade !== "string" || !GRADES.includes(item.grade)) return null;
            grade = item.grade;
        }
        if (content === "" && from === "" && to === "" && grade === "") continue;
        result.push({ fieldId: item.fieldId, content, from, to, grade });
        if (result.length > MAX_ENTRIES) return null;
    }
    return result.length > 0 ? result : null;
}

function parse_pagination(query) {
    const parse = (value, fallback, name) => {
        if (value === undefined || value === "") return fallback;
        if (!/^\d+$/.test(String(value))) return null;
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number < 0) return null;
        return number;
    };
    const limit = parse(query.limit, DEFAULT_PAGE_LIMIT, "limit");
    const skip = parse(query.skip, 0, "skip");
    if (limit === null || limit < 1 || limit > MAX_PAGE_LIMIT || skip === null || skip > 1000000) return null;
    return { limit, skip };
}

function escape_regex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
    NAME_MAX_LENGTH, TITLE_MAX_LENGTH, MATERIAL_MAX_LENGTH, FIELD_NAME_MAX_LENGTH,
    ENTRY_CONTENT_MAX_LENGTH, ENTRY_RANGE_MAX_LENGTH, MAX_ENTRIES,
    is_valid_id, is_valid_section, is_valid_date, is_valid_date_range,
    clean_student_name, clean_title, clean_material, clean_field_name,
    clean_optional_text, clean_entries, escape_regex, normalize_clean_text,
    normalize_arabic_search, parse_pagination
};
