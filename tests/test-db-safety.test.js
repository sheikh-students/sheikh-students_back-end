"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { parse_mongo_uri, assert_safe_test_uri } = require("./helpers/test-db-safety");

describe("عزل قاعدة بيانات الاختبار", function () {
    test("يحلل رابط MongoDB ويستخرج اسم القاعدة والمضيف", function () {
        const parsed = parse_mongo_uri("mongodb://tester:secret@127.0.0.1:27018/sheikh_students_test", "الاختبار");
        assert.equal(parsed.hostname, "127.0.0.1");
        assert.equal(parsed.host, "127.0.0.1:27018");
        assert.equal(parsed.username, "tester");
        assert.equal(parsed.database, "sheikh_students_test");
    });

    test("يرفض نفس خادم Atlas ونفس المستخدم حتى مع اختلاف اسم قاعدة البيانات", function () {
        const primary = "mongodb+srv://main_user:secret@cluster.example.mongodb.net/sheikh_students";
        const test_uri = "mongodb+srv://main_user:secret@cluster.example.mongodb.net/sheikh_students_test";
        assert.throws(
            () => assert_safe_test_uri(test_uri, primary),
            /نفس خادم واسم مستخدم قاعدة الإنتاج/
        );
    });

    test("يسمح باستخدام MongoDB محلي على منفذ منفصل", function () {
        const primary = "mongodb://127.0.0.1:27017/sheikh_students";
        const test_uri = "mongodb://127.0.0.1:27018/sheikh_students_test";
        const parsed = assert_safe_test_uri(test_uri, primary);
        assert.equal(parsed.database, "sheikh_students_test");
    });

    test("يسمح بنفس Atlas cluster عند استخدام مستخدم اختبار مختلف", function () {
        const primary = "mongodb+srv://production_user:secret@cluster.example.mongodb.net/sheikh_students";
        const test_uri = "mongodb+srv://test_user:secret@cluster.example.mongodb.net/sheikh_students_test";
        const parsed = assert_safe_test_uri(test_uri, primary);
        assert.equal(parsed.username, "test_user");
    });

    test("يرفض قاعدة اختبار لا يتضمن اسمها test", function () {
        assert.throws(
            () => assert_safe_test_uri(
                "mongodb://127.0.0.1:27018/sheikh_students_copy",
                "mongodb://127.0.0.1:27017/sheikh_students"
            ),
            /يجب أن يحتوي على كلمة test/
        );
    });

    test("يرفض نفس القاعدة على نفس المضيف", function () {
        assert.throws(
            () => assert_safe_test_uri(
                "mongodb://user:pass@db.example.test/sheikh_students_test",
                "mongodb://user:pass@db.example.test/sheikh_students_test"
            ),
            /تطابق قاعدة البيانات الأساسية/
        );
    });

    test("يسمح بقاعدة اختبار بعيدة منفصلة تماماً في CI", function () {
        const parsed = assert_safe_test_uri(
            "mongodb+srv://test_user:secret@test-cluster.example.mongodb.net/sheikh_students_test",
            "mongodb+srv://production_user:secret@production-cluster.example.mongodb.net/sheikh_students",
            { ci: true }
        );
        assert.equal(parsed.database, "sheikh_students_test");
    });

    test("يرفض الروابط غير الصالحة أو غير المكتملة", function () {
        assert.throws(() => parse_mongo_uri("not-a-uri", "الاختبار"), /غير صالح/);
        assert.throws(() => assert_safe_test_uri("", "mongodb://127.0.0.1:27017/prod"), /يجب ضبط/);
    });
});
