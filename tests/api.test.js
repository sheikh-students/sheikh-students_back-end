// اختبارات الـ API الكاملة على قاعدة بيانات اختبار منفصلة.
// تحتاج MongoDB تعمل، ومتغير MONGODB_URI_TEST في ملف .env
const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();
// لا تسمح لحدود المعدل بتعطيل مجموعة الاختبارات الطويلة.
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.API_WRITE_RATE_LIMIT_MAX = "10000";
process.env.ALLOWED_HOSTS = "127.0.0.1,localhost";

const mongoose = require("mongoose");
const app = require("../src/app");
const connect_db = require("../src/config/db");
const { migrate_legacy_data } = require("../src/config/migrate");
const Student = require("../src/models/student.model");
const Session = require("../src/models/session.model");
const Field = require("../src/models/field.model");
const Counter = require("../src/models/counter.model");
const SchemaMigration = require("../src/models/schema-migration.model");
const { MIGRATION_ID } = require("../src/config/migrate");
const { GRADES } = require("../src/config/constants");
const { parse_mongo_uri, assert_safe_test_uri } = require("./helpers/test-db-safety");

const BOYS = "boys";
const GIRLS = "girls";
const FAKE_ID = "507f1f77bcf86cd799439011";

let server = null;
let base_url = "";

// ---------- أدوات مساعدة ----------

async function request(method, url, body) {
    const options = { method: method, headers: {} };
    if (body !== undefined) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }
    const response = await fetch(base_url + url, options);
    const json = await response.json();
    return { status: response.status, body: json, headers: response.headers };
}

async function create_student(name, section, is_active) {
    const student = await Student.create({
        name: name,
        nameSearch: require("../src/utils/validate").normalize_arabic_search(name),
        section: section || BOYS,
        isActive: is_active !== false
    });
    return String(student._id);
}

async function create_session(section, date, title) {
    const result = await request("POST", "/api/sessions", {
        section: section || BOYS,
        title: title,
        date: date || "2026-11-07"
    });
    assert.equal(result.status, 201);
    return result.body.data._id;
}

// أقسام المتابعة الافتراضية لقسم (تُنشأ تلقائياً عند أول قراءة): الجديد، المراجعة، الأحاديث، التحفة
async function get_fields(section) {
    const result = await request("GET", "/api/fields?section=" + (section || BOYS));
    assert.equal(result.status, 200);
    return result.body.data;
}

function send_entries(session_id, student_id, entries) {
    return request("PATCH", "/api/sessions/" + session_id, {
        action: "add_evaluation",
        studentId: student_id,
        entries: entries
    });
}

// اختصار: يسجل نصاً وتقديراً في أول قسم متابعة (الجديد) من قسم الموقع المحدد
async function add_evaluation(session_id, student_id, content, grade, section) {
    const fields = await get_fields(section);
    return send_entries(session_id, student_id, [
        {
            fieldId: fields[0]._id,
            content: content === undefined ? "الرعد كاملة" : content,
            grade: grade === undefined ? GRADES[0] : grade
        }
    ]);
}

// افحص إعداد URI قبل تسجيل اختبارات التكامل حتى يظهر خطأ الإعداد مرة واحدة،
// بدلاً من إلغاء عشرات الاختبارات التابعة بسبب فشل before hook.
let test_uri_preflight_error = null;
try {
    assert_safe_test_uri(process.env.MONGODB_URI_TEST, process.env.MONGODB_URI);
} catch (error) {
    test_uri_preflight_error = error;
}

if (test_uri_preflight_error) {
    test("إعداد اتصال قاعدة الاختبار آمن", function () {
        throw test_uri_preflight_error;
    });
} else {

let test_db_safe = false;
before(async function () {
    const test_uri = process.env.MONGODB_URI_TEST;
    assert_safe_test_uri(test_uri, process.env.MONGODB_URI);
    await connect_db(test_uri);

    // تحقق إضافي من اسم قاعدة الاتصال الفعلي قبل أي عملية حذف.
    if (!/test/i.test(mongoose.connection.name)) throw new Error("اسم قاعدة الاختبار الفعلي يجب أن يحتوي على كلمة test");
    const primary = parse_mongo_uri(process.env.MONGODB_URI, "قاعدة الإنتاج");
    if (mongoose.connection.host && mongoose.connection.host.toLowerCase() === primary.hostname && mongoose.connection.name === primary.database) {
        throw new Error("اتصال الاختبار وصل إلى قاعدة الإنتاج؛ تم إيقاف الاختبارات");
    }
    await Promise.all([Student.init(), Session.init(), Field.init(), Counter.init(), SchemaMigration.init()]);
    // لا نسمح بالتنظيف أو الحذف إلا بعد نجاح الاتصال والتحقق وبناء الفهارس.
    test_db_safe = true;
    server = app.listen(0);
    base_url = "http://127.0.0.1:" + server.address().port;
});

beforeEach(async function () {
    if (!test_db_safe) throw new Error("رفض حذف البيانات: لم يتم اعتماد أمان قاعدة الاختبار");
    await Field.deleteMany({});
    await Session.deleteMany({});
    await Student.deleteMany({});
    await Counter.deleteMany({});
});

after(async function () {
    if (server) {
        server.close();
    }
    if (test_db_safe && mongoose.connection.readyState === 1 && /test/i.test(mongoose.connection.name)) {
        await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
});

// ---------- الطلاب ----------

describe("الطلاب", function () {
    test("إضافة طالب جديد نشط في قسم", async function () {
        const result = await request("POST", "/api/students", { name: "  محمد أحمد  ", section: BOYS });
        assert.equal(result.status, 201);
        assert.equal(result.body.data.name, "محمد أحمد");
        assert.equal(result.body.data.section, BOYS);
        assert.equal(result.body.data.isActive, true);
    });

    test("القسم مطلوب وصحيح عند الإضافة", async function () {
        assert.equal((await request("POST", "/api/students", { name: "علي" })).status, 400);
        assert.equal((await request("POST", "/api/students", { name: "علي", section: "both" })).status, 400);
        assert.equal((await request("POST", "/api/students", { name: "علي", section: { $ne: null } })).status, 400);
    });

    test("رفض الاسم الفارغ أو غير الصالح", async function () {
        assert.equal((await request("POST", "/api/students", { name: "   ", section: BOYS })).status, 400);
        assert.equal((await request("POST", "/api/students", { section: BOYS })).status, 400);
        assert.equal((await request("POST", "/api/students", { name: 123, section: BOYS })).status, 400);
    });

    test("السماح بتكرار الأسماء", async function () {
        assert.equal((await request("POST", "/api/students", { name: "علي", section: BOYS })).status, 201);
        assert.equal((await request("POST", "/api/students", { name: "علي", section: BOYS })).status, 201);
        const list = await request("GET", "/api/students?section=boys");
        assert.equal(list.body.data.length, 2);
    });

    test("قائمة الطلاب تتطلب القسم ولا تُظهر إلا طلاب ذلك القسم", async function () {
        await create_student("ولد ١", BOYS);
        await create_student("ولد ٢", BOYS);
        await create_student("بنت ١", GIRLS);

        assert.equal((await request("GET", "/api/students")).status, 400);
        assert.equal((await request("GET", "/api/students?section=x")).status, 400);

        const boys = await request("GET", "/api/students?section=boys");
        assert.deepEqual(boys.body.data.map((s) => s.name).sort(), ["ولد ١", "ولد ٢"]);

        const girls = await request("GET", "/api/students?section=girls");
        assert.deepEqual(girls.body.data.map((s) => s.name), ["بنت ١"]);
    });

    test("البحث بالاسم والتصفية بالحالة داخل القسم", async function () {
        await create_student("عبد الله", BOYS);
        await create_student("عبد الرحمن", BOYS);
        await create_student("يوسف", BOYS, false);
        await create_student("عبد العزيز", GIRLS);

        const search = await request("GET", "/api/students?section=boys&search=" + encodeURIComponent("عبد"));
        assert.equal(search.body.data.length, 2);

        const active = await request("GET", "/api/students?section=boys&active=true");
        assert.equal(active.body.data.length, 2);

        const inactive = await request("GET", "/api/students?section=boys&active=false");
        assert.equal(inactive.body.data.length, 1);
        assert.equal(inactive.body.data[0].name, "يوسف");

        assert.equal((await request("GET", "/api/students?section=boys&active=maybe")).status, 400);
    });

    test("البحث برموز regex الخاصة لا يسبب خطأ", async function () {
        await create_student("أحمد (الصغير)", BOYS);
        const result = await request("GET", "/api/students?section=boys&search=" + encodeURIComponent("(الصغير"));
        assert.equal(result.status, 200);
        assert.equal(result.body.data.length, 1);
    });

    test("تعديل الاسم وتعطيل وتفعيل الطالب، والقسم لا يتغير", async function () {
        const id = await create_student("خالد", BOYS);

        const renamed = await request("PATCH", "/api/students/" + id, { name: "خالد بن زيد" });
        assert.equal(renamed.status, 200);
        assert.equal(renamed.body.data.name, "خالد بن زيد");

        const off = await request("PATCH", "/api/students/" + id, { isActive: false });
        assert.equal(off.body.data.isActive, false);

        const on = await request("PATCH", "/api/students/" + id, { isActive: true });
        assert.equal(on.body.data.isActive, true);

        // محاولة نقل الطالب إلى قسم آخر تُتجاهل
        const moved = await request("PATCH", "/api/students/" + id, { name: "خالد", section: GIRLS });
        assert.equal(moved.status, 200);
        assert.equal(moved.body.data.section, BOYS);
    });

    test("أخطاء التعديل: معرف خاطئ، غير موجود، لا بيانات، قيمة خاطئة", async function () {
        assert.equal((await request("PATCH", "/api/students/abc", { name: "س" })).status, 400);
        assert.equal((await request("PATCH", "/api/students/" + FAKE_ID, { name: "س" })).status, 404);

        const id = await create_student("سعيد", BOYS);
        assert.equal((await request("PATCH", "/api/students/" + id, {})).status, 400);
        assert.equal((await request("PATCH", "/api/students/" + id, { isActive: "no" })).status, 400);
        assert.equal((await request("PATCH", "/api/students/" + id, { name: "" })).status, 400);
    });
});

// ---------- الجلسات ----------

describe("الجلسات", function () {
    test("إنشاء جلسة بعنوان وبدون عنوان", async function () {
        const with_title = await request("POST", "/api/sessions", { section: BOYS, title: "مجلس الجمعة", date: "2026-11-06" });
        assert.equal(with_title.status, 201);
        assert.equal(with_title.body.data.title, "مجلس الجمعة");
        assert.equal(with_title.body.data.section, BOYS);
        assert.deepEqual(with_title.body.data.evaluations, []);

        const no_title = await request("POST", "/api/sessions", { section: GIRLS, date: "2026-11-07" });
        assert.equal(no_title.status, 201);
        assert.equal(no_title.body.data.title, "");
    });

    test("رفض القسم أو التاريخ الخاطئ أو المفقود", async function () {
        assert.equal((await request("POST", "/api/sessions", { date: "2026-11-07" })).status, 400);
        assert.equal((await request("POST", "/api/sessions", { section: "x", date: "2026-11-07" })).status, 400);
        assert.equal((await request("POST", "/api/sessions", { section: BOYS })).status, 400);
        assert.equal((await request("POST", "/api/sessions", { section: BOYS, date: "2026-02-31" })).status, 400);
        assert.equal((await request("POST", "/api/sessions", { section: BOYS, date: "07/11/2026" })).status, 400);
    });

    test("قائمة الجلسات لكل قسم وحده: الأحدث أولاً مع عدد الطلاب", async function () {
        const old_id = await create_session(BOYS, "2026-01-01", "قديمة");
        const new_id = await create_session(BOYS, "2026-06-01", "جديدة");
        await create_session(GIRLS, "2026-07-01", "جلسة البنات");

        const student = await create_student("أحمد", BOYS);
        await add_evaluation(new_id, student);

        assert.equal((await request("GET", "/api/sessions")).status, 400);

        const boys = await request("GET", "/api/sessions?section=boys");
        assert.equal(boys.status, 200);
        assert.deepEqual(boys.body.data.map((s) => s._id), [new_id, old_id]);
        assert.equal(boys.body.data[0].evaluationsCount, 1);
        assert.equal(boys.body.data[1].evaluationsCount, 0);

        const girls = await request("GET", "/api/sessions?section=girls");
        assert.deepEqual(girls.body.data.map((s) => s.title), ["جلسة البنات"]);
    });

    test("عرض جلسة واحدة وأخطاء المعرف", async function () {
        const id = await create_session(BOYS);
        const found = await request("GET", "/api/sessions/" + id);
        assert.equal(found.status, 200);
        assert.equal(found.body.data.section, BOYS);

        assert.equal((await request("GET", "/api/sessions/abc")).status, 400);
        assert.equal((await request("GET", "/api/sessions/" + FAKE_ID)).status, 404);
    });

    test("تعديل العنوان والتاريخ، والقسم لا يتغير", async function () {
        const id = await create_session(BOYS, "2026-11-07", "قبل");
        const result = await request("PATCH", "/api/sessions/" + id, {
            action: "update_session",
            title: "بعد",
            date: "2026-11-08",
            section: GIRLS
        });
        assert.equal(result.status, 200);
        assert.equal(result.body.data.title, "بعد");
        assert.equal(result.body.data.date, "2026-11-08");
        assert.equal(result.body.data.section, BOYS);

        const bad_date = await request("PATCH", "/api/sessions/" + id, { action: "update_session", date: "2026-02-31" });
        assert.equal(bad_date.status, 400);
        const nothing = await request("PATCH", "/api/sessions/" + id, { action: "update_session" });
        assert.equal(nothing.status, 400);
    });

    test("حذف الجلسة", async function () {
        const id = await create_session(BOYS);
        assert.equal((await request("DELETE", "/api/sessions/" + id)).status, 200);
        assert.equal((await request("GET", "/api/sessions/" + id)).status, 404);
        assert.equal((await request("DELETE", "/api/sessions/" + id)).status, 404);
        assert.equal((await request("DELETE", "/api/sessions/abc")).status, 400);
    });

    test("جلسة أسبوعية: تاريخ النهاية اختياري ويجب أن يكون بعد البداية", async function () {
        const ok = await request("POST", "/api/sessions", { section: BOYS, date: "2026-10-31", endDate: "2026-11-07" });
        assert.equal(ok.status, 201);
        assert.equal(ok.body.data.endDate, "2026-11-07");

        const none = await request("POST", "/api/sessions", { section: BOYS, date: "2026-10-31" });
        assert.equal(none.body.data.endDate, "");

        assert.equal((await request("POST", "/api/sessions", { section: BOYS, date: "2026-10-31", endDate: "2026-10-30" })).status, 400);
        assert.equal((await request("POST", "/api/sessions", { section: BOYS, date: "2026-10-31", endDate: "غلط" })).status, 400);

        const id = ok.body.data._id;
        const changed = await request("PATCH", "/api/sessions/" + id, { action: "update_session", endDate: "2026-11-14" });
        assert.equal(changed.body.data.endDate, "2026-11-14");
        assert.equal((await request("PATCH", "/api/sessions/" + id, { action: "update_session", endDate: "2026-10-01" })).status, 400);
        assert.equal((await request("PATCH", "/api/sessions/" + id, { action: "update_session", date: "2026-12-01" })).status, 400);

        const cleared = await request("PATCH", "/api/sessions/" + id, { action: "update_session", endDate: "" });
        assert.equal(cleared.body.data.endDate, "");
    });

    test("action غير صحيح", async function () {
        const id = await create_session(BOYS);
        assert.equal((await request("PATCH", "/api/sessions/" + id, { action: "hack" })).status, 400);
        assert.equal((await request("PATCH", "/api/sessions/" + id, {})).status, 400);
    });
});

// ---------- صفوف الجدول (التقييمات) ----------

describe("صفوف الجدول", function () {
    test("إضافة صف بعدة أقسام مع حفظ اسم الطالب واسم القسم", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("محمد إبراهيم", BOYS);
        const fields = await get_fields();

        const result = await send_entries(session_id, student_id, [
            { fieldId: fields[0]._id, content: "  الأحزاب  ", grade: "ممتاز" },
            { fieldId: fields[1]._id, content: "الزمر", grade: "جيد" },
            { fieldId: fields[2]._id, from: " أول الباب ", to: "آخره", grade: "جيد جداً" },
            { fieldId: fields[3]._id }
        ]);
        assert.equal(result.status, 201);

        const row = result.body.data.evaluations[0];
        assert.equal(row.studentName, "محمد إبراهيم");
        // الخانة الفارغة تماماً (التحفة) لا تُحفظ
        assert.equal(row.entries.length, 3);
        assert.equal(row.entries[0].fieldName, "الجديد");
        assert.equal(row.entries[0].content, "الأحزاب");
        assert.equal(row.entries[2].from, "أول الباب");
        assert.equal(row.entries[2].grade, "جيد جداً");
    });

    test("التقدير اختياري داخل الخانة", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("أحمد", BOYS);
        const result = await add_evaluation(session_id, student_id, "الرعد", "");
        assert.equal(result.status, 201);
        assert.equal(result.body.data.evaluations[0].entries[0].grade, "");
    });

    test("رفض المدخلات الخاطئة", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("أحمد", BOYS);
        const fields = await get_fields();
        const field_id = fields[0]._id;

        assert.equal((await add_evaluation(session_id, "abc")).status, 400);
        assert.equal((await send_entries(session_id, student_id, undefined)).status, 400);
        assert.equal((await send_entries(session_id, student_id, [])).status, 400);
        assert.equal((await send_entries(session_id, student_id, "نص")).status, 400);
        assert.equal((await send_entries(session_id, student_id, [{ fieldId: field_id }])).status, 400);
        assert.equal((await send_entries(session_id, student_id, [{ fieldId: field_id, content: "   " }])).status, 400);
        assert.equal((await send_entries(session_id, student_id, [{ fieldId: field_id, content: "ا".repeat(301) }])).status, 400);
        assert.equal((await send_entries(session_id, student_id, [{ fieldId: field_id, from: "ا".repeat(101) }])).status, 400);
        assert.equal((await send_entries(session_id, student_id, [{ fieldId: field_id, content: "نص", grade: "ممتاااز" }])).status, 400);
        assert.equal((await send_entries(session_id, student_id, [{ fieldId: field_id, content: { $ne: 1 } }])).status, 400);
        assert.equal((await send_entries(session_id, student_id, [{ fieldId: "abc", content: "نص" }])).status, 400);
        assert.equal((await send_entries(session_id, student_id, [
            { fieldId: field_id, content: "أ" },
            { fieldId: field_id, content: "ب" }
        ])).status, 400);
        assert.equal((await send_entries(session_id, student_id, [{ fieldId: FAKE_ID, content: "نص" }])).status, 400);
        assert.equal((await add_evaluation(session_id, FAKE_ID)).status, 404);
        assert.equal((await add_evaluation(FAKE_ID, student_id)).status, 404);
    });

    test("قسم متابعة من قسم موقع آخر مرفوض", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("أحمد", BOYS);
        const girls_fields = await get_fields(GIRLS);

        const result = await send_entries(session_id, student_id, [{ fieldId: girls_fields[0]._id, content: "نص" }]);
        assert.equal(result.status, 400);
    });

    test("طالب واحد لا يظهر إلا مرة واحدة في الجلسة", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("أحمد", BOYS);

        assert.equal((await add_evaluation(session_id, student_id)).status, 201);
        const again = await add_evaluation(session_id, student_id, "مادة أخرى");
        assert.equal(again.status, 409);

        const session = await request("GET", "/api/sessions/" + session_id);
        assert.equal(session.body.data.evaluations.length, 1);
    });

    test("طلبات متزامنة لنفس الطالب: صف واحد فقط", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("أحمد", BOYS);
        await get_fields();

        const results = await Promise.all([
            add_evaluation(session_id, student_id, "أ"),
            add_evaluation(session_id, student_id, "ب"),
            add_evaluation(session_id, student_id, "ج")
        ]);

        assert.equal(results.filter((r) => r.status === 201).length, 1);
        const session = await request("GET", "/api/sessions/" + session_id);
        assert.equal(session.body.data.evaluations.length, 1);
    });

    test("لا يدخل طالب من قسم في جلسة قسم آخر", async function () {
        const boys_session = await create_session(BOYS);
        const girls_session = await create_session(GIRLS);
        const boy = await create_student("ولد", BOYS);
        const girl = await create_student("بنت", GIRLS);

        assert.equal((await add_evaluation(boys_session, girl)).status, 409);
        assert.equal((await add_evaluation(girls_session, boy, "نص", "ممتاز", GIRLS)).status, 409);

        assert.equal((await add_evaluation(boys_session, boy)).status, 201);
        assert.equal((await add_evaluation(girls_session, girl, "نص", "ممتاز", GIRLS)).status, 201);
    });

    test("الطالب المعطل لا يُضاف له صف جديد", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("معطل", BOYS, false);
        assert.equal((await add_evaluation(session_id, student_id)).status, 409);
    });

    test("تعديل الخانات، حتى بعد تعطيل الطالب", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("أحمد", BOYS);
        const added = await add_evaluation(session_id, student_id);
        const evaluation_id = added.body.data.evaluations[0]._id;
        const fields = await get_fields();

        await request("PATCH", "/api/students/" + student_id, { isActive: false });

        const updated = await request("PATCH", "/api/sessions/" + session_id, {
            action: "update_evaluation",
            evaluationId: evaluation_id,
            entries: [
                { fieldId: fields[0]._id, content: "الأحزاب ١-٣٥", grade: "جيد جداً" },
                { fieldId: fields[3]._id, from: "المقدمة", to: "الباب الأول" }
            ]
        });
        assert.equal(updated.status, 200);
        const entries = updated.body.data.evaluations[0].entries;
        assert.equal(entries.length, 2);
        assert.equal(entries[0].content, "الأحزاب ١-٣٥");
        assert.equal(entries[0].grade, "جيد جداً");
        assert.equal(entries[1].to, "الباب الأول");
    });

    test("أخطاء التعديل والحذف", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("أحمد", BOYS);
        const added = await add_evaluation(session_id, student_id);
        const evaluation_id = added.body.data.evaluations[0]._id;
        const fields = await get_fields();
        const good = [{ fieldId: fields[0]._id, content: "نص" }];

        const patch = (body) => request("PATCH", "/api/sessions/" + session_id, body);

        assert.equal((await patch({ action: "update_evaluation", evaluationId: "abc", entries: good })).status, 400);
        assert.equal((await patch({ action: "update_evaluation", evaluationId: evaluation_id })).status, 400);
        assert.equal((await patch({ action: "update_evaluation", evaluationId: evaluation_id, entries: [] })).status, 400);
        assert.equal((await patch({ action: "update_evaluation", evaluationId: evaluation_id, entries: [{ fieldId: fields[0]._id, content: "  " }] })).status, 400);
        assert.equal((await patch({ action: "update_evaluation", evaluationId: evaluation_id, entries: [{ fieldId: fields[0]._id, grade: "x" }] })).status, 400);
        assert.equal((await patch({ action: "update_evaluation", evaluationId: FAKE_ID, entries: good })).status, 404);
        assert.equal((await patch({ action: "delete_evaluation", evaluationId: FAKE_ID })).status, 404);

        const missing_session = await request("PATCH", "/api/sessions/" + FAKE_ID, {
            action: "delete_evaluation",
            evaluationId: evaluation_id
        });
        assert.equal(missing_session.status, 404);
    });

    test("حذف صف ثم إمكانية إضافة الطالب من جديد", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("أحمد", BOYS);
        const added = await add_evaluation(session_id, student_id);
        const evaluation_id = added.body.data.evaluations[0]._id;

        const deleted = await request("PATCH", "/api/sessions/" + session_id, {
            action: "delete_evaluation",
            evaluationId: evaluation_id
        });
        assert.equal(deleted.status, 200);
        assert.equal(deleted.body.data.evaluations.length, 0);

        assert.equal((await add_evaluation(session_id, student_id)).status, 201);
    });

    test("تغيير اسم الطالب لا يغير الصفوف القديمة", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("اسم قديم", BOYS);
        await add_evaluation(session_id, student_id);

        await request("PATCH", "/api/students/" + student_id, { name: "اسم جديد" });

        const session = await request("GET", "/api/sessions/" + session_id);
        assert.equal(session.body.data.evaluations[0].studentName, "اسم قديم");
    });

    test("إعادة تسمية القسم لا تغير اسمه المحفوظ في الصفوف القديمة", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("أحمد", BOYS);
        await add_evaluation(session_id, student_id);
        const fields = await get_fields();

        await request("PATCH", "/api/fields/" + fields[0]._id, { name: "الحفظ الجديد" });

        const session = await request("GET", "/api/sessions/" + session_id);
        assert.equal(session.body.data.evaluations[0].entries[0].fieldName, "الجديد");
    });
});

// ---------- أقسام المتابعة (أعمدة الجدول) ----------

describe("أقسام المتابعة", function () {
    test("الأقسام الافتراضية تُنشأ لكل قسم موقع ولا تتكرر", async function () {
        const first = await get_fields(BOYS);
        const second = await get_fields(BOYS);
        assert.deepEqual(first.map((f) => f.name), ["الجديد", "المراجعة", "الأحاديث", "التحفة (الجزرية)"]);
        assert.deepEqual(first.map((f) => f.kind), ["text", "text", "range", "range"]);
        assert.equal(second.length, 4);

        const girls = await get_fields(GIRLS);
        assert.equal(girls.length, 4);
        assert.equal(await Field.countDocuments({}), 8);
    });

    test("القسم مطلوب وصحيح", async function () {
        assert.equal((await request("GET", "/api/fields")).status, 400);
        assert.equal((await request("GET", "/api/fields?section=x")).status, 400);
        assert.equal((await request("POST", "/api/fields", { name: "المتون", kind: "text" })).status, 400);
    });

    test("إضافة قسم جديد يظهر في آخر القائمة", async function () {
        const result = await request("POST", "/api/fields", { section: BOYS, name: "  المتون  ", kind: "range" });
        assert.equal(result.status, 201);
        assert.equal(result.body.data.name, "المتون");
        assert.equal(result.body.data.kind, "range");

        const fields = await get_fields(BOYS);
        assert.equal(fields.length, 5);
        assert.equal(fields[4].name, "المتون");

        // قسم البنات لا يتأثر
        assert.equal((await get_fields(GIRLS)).length, 4);
    });

    test("رفض الاسم أو النوع غير الصالح أو المكرر", async function () {
        assert.equal((await request("POST", "/api/fields", { section: BOYS, name: "   ", kind: "text" })).status, 400);
        assert.equal((await request("POST", "/api/fields", { section: BOYS, name: "ا".repeat(41), kind: "text" })).status, 400);
        assert.equal((await request("POST", "/api/fields", { section: BOYS, name: "قسم", kind: "number" })).status, 400);
        assert.equal((await request("POST", "/api/fields", { section: BOYS, name: { $ne: 1 }, kind: "text" })).status, 400);
        assert.equal((await request("POST", "/api/fields", { section: BOYS, name: "الجديد", kind: "text" })).status, 409);
    });

    test("إعادة التسمية والتعطيل وتعطيل القسم يخفيه من القائمة النشطة", async function () {
        const fields = await get_fields(BOYS);

        const renamed = await request("PATCH", "/api/fields/" + fields[1]._id, { name: "المراجعات" });
        assert.equal(renamed.status, 200);
        assert.equal(renamed.body.data.name, "المراجعات");

        const disabled = await request("PATCH", "/api/fields/" + fields[0]._id, { isActive: false });
        assert.equal(disabled.body.data.isActive, false);

        const active = await request("GET", "/api/fields?section=boys&active=true");
        assert.equal(active.body.data.length, 3);

        assert.equal((await request("PATCH", "/api/fields/" + fields[1]._id, { name: "الجديد" })).status, 409);
        assert.equal((await request("PATCH", "/api/fields/" + fields[1]._id, { name: "  " })).status, 400);
        assert.equal((await request("PATCH", "/api/fields/" + fields[1]._id, { isActive: "no" })).status, 400);
        assert.equal((await request("PATCH", "/api/fields/" + fields[1]._id, {})).status, 400);
        assert.equal((await request("PATCH", "/api/fields/abc", { name: "س" })).status, 400);
        assert.equal((await request("PATCH", "/api/fields/" + FAKE_ID, { name: "س" })).status, 404);
    });

    test("القسم والنوع لا يتغيران", async function () {
        const fields = await get_fields(BOYS);
        await request("PATCH", "/api/fields/" + fields[0]._id, { name: "الجديد ٢", section: GIRLS, kind: "range" });

        const after = await Field.findById(fields[0]._id).lean();
        assert.equal(after.section, BOYS);
        assert.equal(after.kind, "text");
    });

    test("تحريك القسم لأعلى ولأسفل", async function () {
        const fields = await get_fields(BOYS);

        await request("PATCH", "/api/fields/" + fields[2]._id, { move: "up" });
        let names = (await get_fields(BOYS)).map((f) => f.name);
        assert.deepEqual(names, ["الجديد", "الأحاديث", "المراجعة", "التحفة (الجزرية)"]);

        await request("PATCH", "/api/fields/" + fields[0]._id, { move: "up" }); // الأول: لا يتحرك
        await request("PATCH", "/api/fields/" + fields[3]._id, { move: "down" }); // الأخير: لا يتحرك
        names = (await get_fields(BOYS)).map((f) => f.name);
        assert.deepEqual(names, ["الجديد", "الأحاديث", "المراجعة", "التحفة (الجزرية)"]);

        assert.equal((await request("PATCH", "/api/fields/" + fields[0]._id, { move: "left" })).status, 400);
    });

    test("القسم المعطل يبقى ظاهراً في تقرير جلسة فيها بيانات له فقط", async function () {
        const session_id = await create_session(BOYS);
        const other_session = await create_session(BOYS);
        const student_id = await create_student("أحمد", BOYS);
        const other_student = await create_student("علي", BOYS);
        const fields = await get_fields(BOYS);

        await send_entries(session_id, student_id, [{ fieldId: fields[3]._id, from: "أ", to: "ب" }]);
        await request("PATCH", "/api/fields/" + fields[3]._id, { isActive: false });
        await add_evaluation(other_session, other_student);

        const used = await request("GET", "/api/sessions/" + session_id + "/report");
        assert.equal(used.body.data.columns.length, 4);

        const unused = await request("GET", "/api/sessions/" + other_session + "/report");
        assert.equal(unused.body.data.columns.length, 3);
    });
});

// ---------- تقرير الطباعة ----------

describe("تقرير الجلسة (للطباعة)", function () {
    test("الصفوف بترتيب الإدخال مع القسم والتاريخ", async function () {
        const session_id = await create_session(GIRLS, "2026-11-07", "جلسة");
        const first = await create_student("زينب", GIRLS);
        const second = await create_student("آمنة", GIRLS);

        const fields = await get_fields(GIRLS);
        const by_name = {};
        fields.forEach((f) => { by_name[f.name] = f._id; });

        await send_entries(session_id, first, [
            { fieldId: by_name["الجديد"], content: "الملك", grade: "ممتاز" },
            { fieldId: by_name["الأحاديث"], from: "الأول", to: "الخامس", grade: "جيد" }
        ]);
        await send_entries(session_id, second, [
            { fieldId: by_name["المراجعة"], content: "القلم", grade: "جيد جداً" }
        ]);

        const result = await request("GET", "/api/sessions/" + session_id + "/report");
        assert.equal(result.status, 200);

        const report = result.body.data;
        assert.equal(report.section, GIRLS);
        assert.equal(report.date, "2026-11-07");
        assert.equal(report.totalEvaluations, 2);
        assert.deepEqual(report.evaluations.map((e) => e.studentName), ["زينب", "آمنة"]);
        assert.deepEqual(report.columns.map((c) => c.name), ["الجديد", "المراجعة", "الأحاديث", "التحفة (الجزرية)"]);
        assert.equal(report.hasLegacy, false);
        assert.deepEqual(Object.keys(report.evaluations[0]).sort(), ["cells", "legacy", "studentName"]);

        const first_cells = report.evaluations[0].cells;
        assert.equal(first_cells[by_name["الجديد"]].content, "الملك");
        assert.equal(first_cells[by_name["الأحاديث"]].from, "الأول");
        assert.equal(first_cells[by_name["الأحاديث"]].to, "الخامس");
        assert.equal(first_cells[by_name["الأحاديث"]].grade, "جيد");
        assert.equal(report.evaluations[1].cells[by_name["الجديد"]], undefined);
    });

    test("جلسة فارغة وأخطاء المعرف", async function () {
        const session_id = await create_session(BOYS);
        const result = await request("GET", "/api/sessions/" + session_id + "/report");
        assert.equal(result.status, 200);
        assert.equal(result.body.data.totalEvaluations, 0);

        assert.equal((await request("GET", "/api/sessions/abc/report")).status, 400);
        assert.equal((await request("GET", "/api/sessions/" + FAKE_ID + "/report")).status, 404);
    });
});

// ---------- الصفحة الرئيسية للقسم ----------

describe("إحصائيات القسم", function () {
    test("كل قسم يحسب طلابه وجلساته فقط", async function () {
        await create_student("ولد ١", BOYS);
        await create_student("ولد ٢", BOYS);
        await create_student("ولد معطل", BOYS, false);
        await create_student("بنت", GIRLS);
        await create_session(BOYS);
        await create_session(BOYS);
        await create_session(GIRLS);

        assert.equal((await request("GET", "/api/dashboard")).status, 400);

        const boys = await request("GET", "/api/dashboard?section=boys");
        assert.equal(boys.body.data.activeStudents, 2);
        assert.equal(boys.body.data.totalSessions, 2);
        assert.equal(boys.body.data.latestSessions.length, 2);

        const girls = await request("GET", "/api/dashboard?section=girls");
        assert.equal(girls.body.data.activeStudents, 1);
        assert.equal(girls.body.data.totalSessions, 1);
    });
});

// ---------- الأمان والمسارات ----------

describe("الأمان والمسارات", function () {
    test("لا توجد مسارات نسخ احتياطي أو استعادة", async function () {
        assert.equal((await request("GET", "/api/backup/export")).status, 404);
        assert.equal((await request("POST", "/api/backup/restore", {})).status, 404);
    });

    test("رؤوس الأمان ومنع التخزين المؤقت للـ API", async function () {
        const result = await request("GET", "/api/students?section=boys");
        assert.match(result.headers.get("content-security-policy"), /script-src 'self'/);
        assert.equal(result.headers.get("x-content-type-options"), "nosniff");
        assert.equal(result.headers.get("cache-control"), "no-store");
        assert.equal(result.headers.get("x-powered-by"), null);
        assert.ok(result.headers.get("ratelimit") || result.headers.get("ratelimit-limit") || result.headers.get("ratelimit-policy"));
    });

    test("JSON فاسد أو كبير جداً يُرفض برسالة آمنة", async function () {
        const bad = await fetch(base_url + "/api/students", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{bad json"
        });
        assert.equal(bad.status, 400);
        const bad_body = await bad.json();
        assert.equal(bad_body.message, "صيغة JSON غير صحيحة");

        const huge = await fetch(base_url + "/api/students", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "ا".repeat(200000), section: BOYS })
        });
        assert.equal(huge.status, 413);
        const huge_body = await huge.json();
        assert.equal(huge_body.message, "حجم البيانات المرسلة كبير جداً");

        const bad_charset = await fetch(base_url + "/api/students", {
            method: "POST", headers: { "Content-Type": "application/json; charset=x-unknown" }, body: "{}"
        });
        assert.equal(bad_charset.status, 415);
        assert.equal((await bad_charset.json()).message, "ترميز النص المرسل غير مدعوم");
        const bad_encoding = await fetch(base_url + "/api/students", {
            method: "POST", headers: { "Content-Type": "application/json", "Content-Encoding": "compress" }, body: "{}"
        });
        assert.equal(bad_encoding.status, 415);
        assert.equal((await bad_encoding.json()).message, "ترميز ضغط البيانات المرسلة غير مدعوم");
    });

    test("مسار API غير موجود والطرق غير المدعومة", async function () {
        const result = await request("GET", "/api/nothing");
        assert.equal(result.status, 404);
        const wrong_method = await request("PUT", "/api/students");
        assert.equal(wrong_method.status, 405);
        assert.equal(wrong_method.headers.get("allow"), "GET, POST");
        const page_missing = await fetch(base_url + "/this-page-does-not-exist");
        assert.equal(page_missing.status, 404);
        assert.match(await page_missing.text(), /الصفحة غير موجودة/);
    });

    test("الحقول المحقونة ($ne) لا تعمل كشروط", async function () {
        await create_student("أحمد", BOYS);
        const result = await request("GET", "/api/students?section[$ne]=boys");
        assert.equal(result.status, 400);
    });
});

// ---------- ترحيل البيانات القديمة ----------

describe("ترحيل البيانات القديمة", function () {
    test("الطلاب والجلسات بلا قسم تنتقل إلى الأولاد، والتقييم القديم يصبح نصاً", async function () {
        await Student.collection.insertOne({ name: "طالب قديم", isActive: true, createdAt: new Date() });
        const old_student = await Student.collection.findOne({ name: "طالب قديم" });

        await Session.collection.insertOne({
            title: "جلسة قديمة",
            date: "2026-01-01",
            createdAt: new Date(),
            evaluations: [
                {
                    _id: new mongoose.Types.ObjectId(),
                    studentId: old_student._id,
                    studentName: "طالب قديم",
                    subject: "القرآن الكريم",
                    grade: "ممتاز",
                    notes: "حفظ جيد",
                    createdAt: new Date()
                }
            ]
        });

        await SchemaMigration.deleteOne({ _id: MIGRATION_ID }); // محاكاة ترقية نسخة قديمة على قاعدة الاختبار
        await migrate_legacy_data();
        const after_first_migration = await Session.collection.findOne({ title: "جلسة قديمة" });
        await migrate_legacy_data(); // مرة ثانية: يجب ألا يتغير شيء
        const after_second_migration = await Session.collection.findOne({ title: "جلسة قديمة" });
        assert.deepEqual(after_second_migration.evaluations, after_first_migration.evaluations);

        const students = await request("GET", "/api/students?section=boys");
        assert.equal(students.body.data.length, 1);

        const sessions = await request("GET", "/api/sessions?section=boys");
        assert.equal(sessions.body.data.length, 1);

        const details = await request("GET", "/api/sessions/" + sessions.body.data[0]._id);
        assert.equal(details.body.data.evaluations[0].material, "القرآن الكريم: حفظ جيد");

        // القسم الافتراضي للمتابعة أُنشئ، والبيانات القديمة تظهر في التقرير كملاحظات سابقة
        assert.equal((await Field.countDocuments({ section: "boys" })), 4);
        const report = await request("GET", "/api/sessions/" + sessions.body.data[0]._id + "/report");
        assert.equal(report.body.data.hasLegacy, true);
        assert.equal(report.body.data.evaluations[0].legacy.material, "القرآن الكريم: حفظ جيد");
        assert.equal(report.body.data.evaluations[0].legacy.grade, "ممتاز");

        const girls = await request("GET", "/api/students?section=girls");
        assert.equal(girls.body.data.length, 0);
    });
});

// ---------- إصلاحات التحقق والبيانات المتزامنة ----------

describe("التحقق من أنواع الأقسام وحالتها", function () {
    test("يرفض خانات من/إلى في القسم النصي والعكس", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("طالب أنواع", BOYS);
        const fields = await get_fields(BOYS);
        assert.equal((await send_entries(session_id, student_id, [{ fieldId: fields[0]._id, from: "١", to: "٢" }])).status, 400);
        assert.equal((await send_entries(session_id, student_id, [{ fieldId: fields[2]._id, content: "نص غير مناسب" }])).status, 400);
    });

    test("يرفض القسم المعطل عند الإضافة ويسمح بتعديل صف قديم يستخدمه", async function () {
        const session_id = await create_session(BOYS);
        const first_student = await create_student("طالب قديم", BOYS);
        const second_student = await create_student("طالب جديد", BOYS);
        const fields = await get_fields(BOYS);
        assert.equal((await send_entries(session_id, first_student, [{ fieldId: fields[0]._id, content: "قديم" }])).status, 201);
        const current = await request("GET", "/api/sessions/" + session_id);
        const evaluation = current.body.data.evaluations[0];
        assert.equal((await request("PATCH", "/api/fields/" + fields[0]._id, { isActive: false })).status, 200);
        assert.equal((await send_entries(session_id, second_student, [{ fieldId: fields[0]._id, content: "جديد" }])).status, 409);
        const updated = await request("PATCH", "/api/sessions/" + session_id, {
            action: "update_evaluation", evaluationId: evaluation._id,
            entries: [{ fieldId: fields[0]._id, content: "تم تعديل القديم" }]
        });
        assert.equal(updated.status, 200);
        assert.equal(updated.body.data.evaluations[0].entries[0].content, "تم تعديل القديم");
    });
});

describe("الاحتفاظ بالأسماء والتعارض", function () {
    test("إعادة تسمية القسم لا تغير عمود التقرير أو fieldName المحفوظ", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("طالب التقرير", BOYS);
        const fields = await get_fields(BOYS);
        await send_entries(session_id, student_id, [{ fieldId: fields[0]._id, content: "الحفظ" }]);
        assert.equal((await request("PATCH", "/api/fields/" + fields[0]._id, { name: "الجديد بعد التسمية" })).status, 200);
        const report = await request("GET", "/api/sessions/" + session_id + "/report");
        assert.equal(report.body.data.columns.find((column) => column.id === fields[0]._id).name, "الجديد");
        const details = await request("GET", "/api/sessions/" + session_id);
        const evaluation = details.body.data.evaluations[0];
        const updated = await request("PATCH", "/api/sessions/" + session_id, {
            action: "update_evaluation", evaluationId: evaluation._id,
            entries: [{ fieldId: fields[0]._id, content: "تعديل مع الاسم التاريخي" }]
        });
        assert.equal(updated.body.data.evaluations[0].entries[0].fieldName, "الجديد");
    });

    test("expectedUpdatedAt يمنع الكتابة فوق تعديل تبويب آخر برسالة 409", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("طالب التعارض", BOYS);
        const fields = await get_fields(BOYS);
        await send_entries(session_id, student_id, [{ fieldId: fields[0]._id, content: "قبل" }]);
        const details = await request("GET", "/api/sessions/" + session_id);
        const evaluation = details.body.data.evaluations[0];
        assert.ok(evaluation.updatedAt);
        const fresh = await request("PATCH", "/api/sessions/" + session_id, {
            action: "update_evaluation", evaluationId: evaluation._id, expectedUpdatedAt: evaluation.updatedAt,
            entries: [{ fieldId: fields[0]._id, content: "تعديل أول" }]
        });
        assert.equal(fresh.status, 200);
        const stale = await request("PATCH", "/api/sessions/" + session_id, {
            action: "update_evaluation", evaluationId: evaluation._id, expectedUpdatedAt: evaluation.updatedAt,
            entries: [{ fieldId: fields[0]._id, content: "تعديل قديم" }]
        });
        assert.equal(stale.status, 409);
        assert.equal(stale.body.message, "تم تعديل هذا الصف من مكان آخر، أعد تحميل الصفحة");
    });
});

describe("الحدود والبحث والترقيم والبيانات الوصفية", function () {
    test("يطبّع البحث العربي ويقبل pagination اختيارياً", async function () {
        await create_student("أَحْمَد", BOYS);
        await create_student("إبراهيم", BOYS);
        const search = await request("GET", "/api/students?section=boys&search=احمد&limit=1");
        assert.equal(search.status, 200);
        assert.equal(search.body.data.length, 1);
        assert.equal(search.body.data[0].name, "أَحْمَد");
        assert.equal(search.body.meta.total, 1);
        assert.equal((await request("GET", "/api/students?section=boys&limit=101")).status, 400);
        await create_session(BOYS, "2026-11-01");
        await create_session(BOYS, "2026-11-02");
        const sessions = await request("GET", "/api/sessions?section=boys&limit=1&skip=1");
        assert.equal(sessions.body.data.length, 1);
        assert.equal(sessions.body.meta.total, 2);
    });

    test("يرفض تجاوز حد أقسام المتابعة ويعرض القيم الموحدة في meta", async function () {
        await get_fields(BOYS); // أربعة افتراضية
        for (let index = 0; index < 16; index += 1) {
            const result = await request("POST", "/api/fields", { section: BOYS, name: "عمود " + index, kind: "text" });
            assert.equal(result.status, 201);
        }
        const rejected = await request("POST", "/api/fields", { section: BOYS, name: "عمود زائد", kind: "text" });
        assert.equal(rejected.status, 409);
        const meta = await request("GET", "/api/meta");
        assert.equal(meta.body.data.limits.fieldsPerSection, 20);
        assert.deepEqual(meta.body.data.grades, GRADES);
        const fs = require("node:fs");
        const frontend_api = fs.readFileSync(require("node:path").join(__dirname, "../public/js/api.js"), "utf8");
        const grades_match = frontend_api.match(/const GRADES = (\[[^;]+\]);/);
        assert.ok(grades_match, "يجب أن يحتوي public/js/api.js على GRADES");
        assert.deepEqual(JSON.parse(grades_match[1]), GRADES);
    });

    test("يرفض السنوات غير المنطقية والمدى الأكبر من 31 يوماً", async function () {
        assert.equal((await request("POST", "/api/sessions", { section: BOYS, date: "0001-01-01" })).status, 400);
        assert.equal((await request("POST", "/api/sessions", { section: BOYS, date: "9999-12-31" })).status, 400);
        assert.equal((await request("POST", "/api/sessions", { section: BOYS, date: "2026-11-01", endDate: "2026-12-03" })).status, 400);
    });
});

describe("ترحيل آمن وتزامن ترتيب الأقسام وحد الجلسة", function () {
    test("الترحيل لا يضيف material لتقييم جديد ويظل ثابتاً عند التكرار", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("طالب حديث", BOYS);
        const fields = await get_fields(BOYS);
        await send_entries(session_id, student_id, [{ fieldId: fields[0]._id, content: "نص جديد" }]);
        await SchemaMigration.deleteOne({ _id: MIGRATION_ID });
        await migrate_legacy_data();
        const first = await Session.findById(session_id).lean();
        assert.equal(Object.prototype.hasOwnProperty.call(first.evaluations[0], "material"), false);
        const first_updated_at = new Date(first.updatedAt).getTime();
        await migrate_legacy_data();
        const second = await Session.findById(session_id).lean();
        assert.equal(Object.prototype.hasOwnProperty.call(second.evaluations[0], "material"), false);
        assert.equal(new Date(second.updatedAt).getTime(), first_updated_at);
        assert.deepEqual(second.evaluations[0].entries.map((entry) => entry.fieldName), ["الجديد"]);
    });

    test("ترقيم عمودين متزامنين يستخدم قيماً ذرية مختلفة", async function () {
        await get_fields(BOYS);
        const [first, second] = await Promise.all([
            request("POST", "/api/fields", { section: BOYS, name: "قسم متزامن أ", kind: "text" }),
            request("POST", "/api/fields", { section: BOYS, name: "قسم متزامن ب", kind: "range" })
        ]);
        assert.equal(first.status, 201);
        assert.equal(second.status, 201);
        assert.notEqual(first.body.data.order, second.body.data.order);
    });

    test("حد 500 تقييماً يُطبّق داخل عملية الكتابة الذرية", async function () {
        const session_id = await create_session(BOYS);
        const student_id = await create_student("طالب رقم 501", BOYS);
        const fields = await get_fields(BOYS);
        const now = new Date();
        const evaluations = Array.from({ length: 500 }, (_, index) => ({
            _id: new mongoose.Types.ObjectId(), studentId: new mongoose.Types.ObjectId(),
            studentName: "طالب سابق " + index, entries: [], createdAt: now, updatedAt: now
        }));
        await Session.collection.updateOne(
            { _id: new mongoose.Types.ObjectId(session_id) },
            { $set: { evaluations, evaluationsCount: 500 } }
        );
        const rejected = await send_entries(session_id, student_id, [{ fieldId: fields[0]._id, content: "لن تُضاف" }]);
        assert.equal(rejected.status, 409);
        assert.match(rejected.body.message, /الحد الأقصى/);
    });
});
}
