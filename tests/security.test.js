const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { create_host_middleware } = require("../src/middlewares/host.middleware");

describe("تقييد Host", function () {
    test("يسمح بالمضيف المدرج ويرفض المضيف غير المدرج برسالة عربية", function () {
        const middleware = create_host_middleware("localhost,127.0.0.1");
        let next_called = false;
        const allowed_response = { status() { throw new Error("لم يكن متوقعاً رفض المضيف"); }, json() {} };
        middleware({ hostname: "localhost" }, allowed_response, () => { next_called = true; });
        assert.equal(next_called, true);

        let status_code = 0;
        let body = null;
        const denied_response = {
            status(code) { status_code = code; return this; },
            json(value) { body = value; return this; }
        };
        middleware({ hostname: "evil.example" }, denied_response, () => { throw new Error("تم قبول مضيف غير مسموح"); });
        assert.equal(status_code, 403);
        assert.equal(body.message, "اسم المضيف غير مسموح به");
    });

    test("القائمة الفارغة لا تقيّد المضيفين", function () {
        const middleware = create_host_middleware("");
        let called = false;
        middleware({ hostname: "any.example" }, {}, () => { called = true; });
        assert.equal(called, true);
    });
});
