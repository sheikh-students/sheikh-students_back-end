"use strict";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function parse_mongo_uri(uri, label) {
    if (typeof uri !== "string" || !uri.trim()) {
        throw new Error("رابط " + label + " غير موجود");
    }

    let parsed;
    try {
        parsed = new URL(uri);
    } catch (error) {
        throw new Error("رابط " + label + " غير صالح", {
            cause: error
        });
    }

    if (!(["mongodb:", "mongodb+srv:"].includes(parsed.protocol))) {
        throw new Error("رابط " + label + " يجب أن يبدأ بـ mongodb:// أو mongodb+srv://");
    }

    const database = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] || "");
    return {
        host: parsed.host.toLowerCase(),
        hostname: parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ""),
        username: decodeURIComponent(parsed.username || ""),
        database: database
    };
}

function assert_safe_test_uri(test_uri, primary_uri, options) {
    const settings = options || {};
    if (!test_uri || !primary_uri) {
        throw new Error("يجب ضبط MONGODB_URI وMONGODB_URI_TEST في ملف .env");
    }

    const test = parse_mongo_uri(test_uri, "قاعدة الاختبار");
    const primary = parse_mongo_uri(primary_uri, "قاعدة الإنتاج");

    if (!test.database || !/test/i.test(test.database)) {
        throw new Error("اسم قاعدة الاختبار يجب أن يحتوي على كلمة test");
    }

    if (test.database === primary.database && test.host === primary.host) {
        throw new Error("قاعدة الاختبار تطابق قاعدة البيانات الأساسية");
    }

    // لا نسمح بإعادة استخدام نفس حساب قاعدة الإنتاج على نفس الخادم،
    // حتى لو اختلف اسم قاعدة البيانات؛ فقد يمتلك الحساب صلاحية حذف قاعدة الإنتاج.
    if (test.host === primary.host && test.username === primary.username) {
        throw new Error(
            "إعداد MONGODB_URI_TEST غير آمن: يستخدم نفس خادم واسم مستخدم قاعدة الإنتاج.\n" +
            "الحل الموصى به: شغّل MongoDB محلياً بالأمر:\n" +
            "docker run --name sheikh-students-test-mongo --rm -d -p 127.0.0.1:27018:27017 mongo:7\n" +
            "ثم غيّر MONGODB_URI_TEST في ملف .env إلى:\n" +
            "MONGODB_URI_TEST=mongodb://127.0.0.1:27018/sheikh_students_test\n" +
            "لا تغيّر MONGODB_URI الخاص ببياناتك الحقيقية.\n" +
            "بديل Atlas: أنشئ مستخدم قاعدة بيانات مختلفاً بصلاحية readWrite على قاعدة الاختبار فقط."
        );
    }

    const is_ci = settings.ci === undefined ? Boolean(process.env.CI) : Boolean(settings.ci);
    if (is_ci) {
        const is_local = LOCAL_HOSTS.has(test.hostname);
        const fully_separate = test.database !== primary.database &&
            (test.host !== primary.host || test.username !== primary.username);
        if (!is_local && !fully_separate) {
            throw new Error("في CI يجب أن تكون قاعدة الاختبار محلية أو منفصلة تماماً عن قاعدة الإنتاج");
        }
    }

    return test;
}

module.exports = {
    parse_mongo_uri: parse_mongo_uri,
    assert_safe_test_uri: assert_safe_test_uri
};
