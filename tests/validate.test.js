// اختبارات دوال التحقق. لا تحتاج قاعدة بيانات.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
    is_valid_id,
    is_valid_date,
    clean_student_name,
    clean_title,
    clean_material,
    is_valid_section,
    escape_regex
} = require("../src/utils/validate");

describe("is_valid_id", function () {
    test("يقبل معرفاً من 24 حرفاً سداسياً عشرياً", function () {
        assert.equal(is_valid_id("507f1f77bcf86cd799439011"), true);
    });

    test("يرفض القيم الخاطئة", function () {
        assert.equal(is_valid_id("123"), false);
        assert.equal(is_valid_id("zzzzzzzzzzzzzzzzzzzzzzzz"), false);
        assert.equal(is_valid_id(undefined), false);
        assert.equal(is_valid_id({ $ne: null }), false);
    });
});

describe("is_valid_date", function () {
    test("يقبل تاريخاً حقيقياً", function () {
        assert.equal(is_valid_date("2026-11-07"), true);
        assert.equal(is_valid_date("2028-02-29"), true);
    });

    test("يرفض تاريخاً غير حقيقي أو بصيغة مختلفة", function () {
        assert.equal(is_valid_date("2026-02-31"), false);
        assert.equal(is_valid_date("2027-02-29"), false);
        assert.equal(is_valid_date("2026-13-01"), false);
        assert.equal(is_valid_date("07-11-2026"), false);
        assert.equal(is_valid_date("2026-1-7"), false);
        assert.equal(is_valid_date(""), false);
        assert.equal(is_valid_date(20261107), false);
    });
});

describe("clean_student_name", function () {
    test("يحذف المسافات الزائدة", function () {
        assert.equal(clean_student_name("  أحمد   علي  "), "أحمد علي");
    });

    test("يرفض الفارغ وغير النص والطويل", function () {
        assert.equal(clean_student_name("   "), null);
        assert.equal(clean_student_name(""), null);
        assert.equal(clean_student_name(123), null);
        assert.equal(clean_student_name({ name: "x" }), null);
        assert.equal(clean_student_name("ا".repeat(101)), null);
        assert.equal(clean_student_name("ا".repeat(100)), "ا".repeat(100));
    });
});

describe("clean_title", function () {
    test("القيم الفارغة تصبح نصاً فارغاً", function () {
        assert.equal(clean_title(undefined), "");
        assert.equal(clean_title(null), "");
        assert.equal(clean_title("   "), "");
    });

    test("يرفض غير النص والطويل جداً", function () {
        assert.equal(clean_title(5), null);
        assert.equal(clean_title("ا".repeat(151)), null);
    });
});

describe("clean_material", function () {
    test("يحافظ على الأسطر ويوحّد المسافات الزائدة", function () {
        assert.equal(clean_material("  الرعد   كاملة \r\n\n  الحديث ١-٨٠٠  "), "الرعد كاملة\nالحديث ١-٨٠٠");
    });

    test("مطلوب: يرفض الفارغ وغير النص والطويل جداً", function () {
        assert.equal(clean_material(undefined), null);
        assert.equal(clean_material("   \n  "), null);
        assert.equal(clean_material(42), null);
        assert.equal(clean_material([]), null);
        assert.equal(clean_material("ا".repeat(601)), null);
        assert.equal(clean_material("ا".repeat(600)), "ا".repeat(600));
    });
});

describe("is_valid_section", function () {
    test("يقبل boys و girls فقط", function () {
        assert.equal(is_valid_section("boys"), true);
        assert.equal(is_valid_section("girls"), true);
        assert.equal(is_valid_section("both"), false);
        assert.equal(is_valid_section(""), false);
        assert.equal(is_valid_section(undefined), false);
        assert.equal(is_valid_section({ $ne: null }), false);
        assert.equal(is_valid_section(["boys"]), false);
    });
});

describe("escape_regex", function () {
    test("يعطل رموز regex الخاصة", function () {
        const pattern = new RegExp(escape_regex("أحمد (الصغير) [1]"), "i");
        assert.equal(pattern.test("الطالب أحمد (الصغير) [1]"), true);
        assert.equal(new RegExp(escape_regex(".*")).test("abc"), false);
    });
});

describe("clean_entries", function () {
    const { clean_entries, clean_field_name } = require("../src/utils/validate");
    const ID_1 = "507f1f77bcf86cd799439011";
    const ID_2 = "507f1f77bcf86cd799439012";

    test("ينظف النصوص ويحذف الخانات الفارغة", function () {
        const result = clean_entries([
            { fieldId: ID_1, content: "  أ \n\n ب  ", grade: "ممتاز" },
            { fieldId: ID_2 }
        ]);
        assert.deepEqual(result, [{ fieldId: ID_1, content: "أ\nب", from: "", to: "", grade: "ممتاز" }]);
    });

    test("يرفض القيم الخاطئة", function () {
        assert.equal(clean_entries(undefined), null);
        assert.equal(clean_entries([]), null);
        assert.equal(clean_entries([{ fieldId: ID_1 }]), null);
        assert.equal(clean_entries([{ fieldId: "x", content: "أ" }]), null);
        assert.equal(clean_entries([{ fieldId: ID_1, content: "أ", grade: "؟" }]), null);
        assert.equal(clean_entries([{ fieldId: ID_1, content: 5 }]), null);
        assert.equal(clean_entries([{ fieldId: ID_1, from: "ا".repeat(101) }]), null);
        assert.equal(clean_entries([{ fieldId: ID_1, content: "أ" }, { fieldId: ID_1, content: "ب" }]), null);
    });

    test("اسم القسم", function () {
        assert.equal(clean_field_name("  المتون   الجزرية "), "المتون الجزرية");
        assert.equal(clean_field_name("   "), null);
        assert.equal(clean_field_name("ا".repeat(41)), null);
        assert.equal(clean_field_name(5), null);
    });
});

describe("التنظيف والتطبيع وحدود التاريخ", function () {
    const { normalize_arabic_search, clean_student_name, clean_title, clean_material, is_valid_date_range, clean_entries } = require("../src/utils/validate");
    const ID = "507f1f77bcf86cd799439011";
    test("توحيد البحث العربي يزيل التشكيل والتطويل ويوحد الحروف", function () {
        assert.equal(normalize_arabic_search("أَحْمَـد"), "احمد");
        assert.equal(normalize_arabic_search("هدى"), "هدي");
        assert.equal(normalize_arabic_search("مدرسة"), "مدرسه");
    });
    test("إزالة محارف التحكم والاتجاه والخفية وتوحيد Unicode", function () {
        assert.equal(clean_student_name("أحمد\u202E\u200B علي"), "أحمد علي");
        assert.equal(clean_student_name("ا\u0001ب"), "اب");
        assert.equal(clean_material("ا\u202Eب"), "اب");
        assert.equal(clean_title("عنوان\nثانٍ"), "عنوان ثانٍ");
        assert.equal(clean_student_name("ا\u0654"), "أ");
    });
    test("مدى الجلسة لا يزيد عن 31 يوماً والسنوات من 2000 إلى 2100", function () {
        assert.equal(is_valid_date_range("2026-01-01", "2026-02-01"), true);
        assert.equal(is_valid_date_range("2026-01-01", "2026-02-02"), false);
        assert.equal(is_valid_date_range("0001-01-01", "0001-01-02"), false);
    });
    test("يُحذف الفراغ قبل احتساب حد الخانات", function () {
        const input = Array.from({ length: 21 }, (_, index) => ({ fieldId: (BigInt("0x507f1f77bcf86cd799439011") + BigInt(index)).toString(16).padStart(24, "0") }));
        input[0].content = "محتوى";
        assert.equal(clean_entries(input).length, 1);
        assert.equal(clean_entries(input.map((item) => ({ ...item, content: "م" }))), null);
    });
});
