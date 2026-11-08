const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { create_cors_middleware } = require("../src/middlewares/cors.middleware");

function mock_response() {
    return {
        status_code: 200,
        headers: {},
        body: null,
        ended: false,
        setHeader(name, value) { this.headers[name] = value; },
        vary(value) { this.headers.Vary = value; },
        status(code) { this.status_code = code; return this; },
        json(value) { this.body = value; return this; },
        end() { this.ended = true; return this; }
    };
}

describe("CORS للواجهة المستقلة", function () {
    test("يسمح بالأصل المدرج ويعيد ترويسات CORS", function () {
        const middleware = create_cors_middleware("https://students.example.com,http://localhost:5500");
        const res = mock_response();
        let next_called = false;
        middleware({
            method: "GET",
            protocol: "https",
            headers: { origin: "https://students.example.com", host: "api.example.com" }
        }, res, () => { next_called = true; });

        assert.equal(next_called, true);
        assert.equal(res.headers["Access-Control-Allow-Origin"], "https://students.example.com");
        assert.match(res.headers["Access-Control-Allow-Methods"], /PATCH/);
        assert.equal(res.headers["Access-Control-Allow-Credentials"], undefined);
    });

    test("يرفض أصلاً غير مدرج", function () {
        const middleware = create_cors_middleware("https://students.example.com");
        const res = mock_response();
        let next_called = false;
        middleware({
            method: "GET",
            protocol: "https",
            headers: { origin: "https://evil.example", host: "api.example.com" }
        }, res, () => { next_called = true; });

        assert.equal(next_called, false);
        assert.equal(res.status_code, 403);
        assert.equal(res.body.message, "مصدر الطلب غير مسموح به");
    });

    test("ينهي طلب preflight المسموح به بـ 204", function () {
        const middleware = create_cors_middleware("https://students.example.com");
        const res = mock_response();
        let next_called = false;
        middleware({
            method: "OPTIONS",
            protocol: "https",
            headers: { origin: "https://students.example.com", host: "api.example.com" }
        }, res, () => { next_called = true; });

        assert.equal(next_called, false);
        assert.equal(res.status_code, 204);
        assert.equal(res.ended, true);
    });

    test("يسمح بالطلب من نفس الأصل دون إعداد CORS_ORIGINS", function () {
        const middleware = create_cors_middleware("");
        const res = mock_response();
        let next_called = false;
        middleware({
            method: "POST",
            protocol: "https",
            headers: { origin: "https://api.example.com", host: "api.example.com" }
        }, res, () => { next_called = true; });

        assert.equal(next_called, true);
        assert.equal(res.headers["Access-Control-Allow-Origin"], undefined);
    });

    test("لا يسمح ببيانات الاعتماد إلا عند تفعيلها صراحة", function () {
        const middleware = create_cors_middleware("https://students.example.com", true);
        const res = mock_response();
        middleware({
            method: "GET",
            protocol: "https",
            headers: { origin: "https://students.example.com", host: "api.example.com" }
        }, res, () => {});
        assert.equal(res.headers["Access-Control-Allow-Credentials"], "true");
    });

    test("يسمح لعملاء غير المتصفح الذين لا يرسلون Origin", function () {
        const middleware = create_cors_middleware("");
        let next_called = false;
        middleware({ method: "GET", headers: {} }, mock_response(), () => { next_called = true; });
        assert.equal(next_called, true);
    });
});
