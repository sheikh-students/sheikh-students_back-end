const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const project_root = path.resolve(__dirname, '..');
const public_root = path.join(project_root, 'public');
const pages_dir = path.join(public_root, 'pages');

test('روابط ملفات الواجهة النسبية تشير إلى ملفات موجودة', () => {
    const page_files = fs.readdirSync(pages_dir).filter((name) => name.endsWith('.html'));

    assert.ok(page_files.length > 0, 'يجب أن توجد صفحات HTML داخل public/pages');

    for (const file_name of page_files) {
        const file_path = path.join(pages_dir, file_name);
        const html = fs.readFileSync(file_path, 'utf8');
        const references = [
            ...html.matchAll(/(?:href|src)="([^"]+)"/g)
        ].map((match) => match[1]).filter((value) => value.startsWith('../'));

        assert.ok(references.length > 0, `${file_name}: يجب استخدام مسارات نسبية للملفات المشتركة`);

        for (const reference of references) {
            const local_path = path.resolve(path.dirname(file_path), reference);
            assert.ok(
                local_path.startsWith(public_root + path.sep),
                `${file_name}: المرجع يخرج خارج public: ${reference}`
            );
            assert.ok(fs.existsSync(local_path), `${file_name}: الملف غير موجود: ${reference}`);
        }
    }
});

test('روابط الصفحة الرئيسية نسبية إلى جذر public', () => {
    const index_path = path.join(public_root, 'index.html');
    const html = fs.readFileSync(index_path, 'utf8');
    const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((value) => value.startsWith('css/') || value.startsWith('pages/'));

    assert.ok(references.includes('css/style.css'));
    assert.ok(references.includes('pages/section.html?section=boys'));
    assert.ok(references.includes('pages/section.html?section=girls'));

    for (const reference of references) {
        const relative_file = reference.split('?')[0];
        assert.ok(fs.existsSync(path.resolve(public_root, relative_file)), `الملف غير موجود: ${reference}`);
    }
});

test('روابط التنقل الداخلية لا تفترض جذر النطاق', () => {
    const api_js = fs.readFileSync(path.join(public_root, 'js/api.js'), 'utf8');
    const details_js = fs.readFileSync(path.join(public_root, 'js/session-details.js'), 'utf8');

    assert.match(api_js, /let url = "\.\/" \+ page \+ "\.html\?/);
    assert.match(api_js, /window\.location\.replace\("\.\.\/index\.html"\)/);
    assert.match(details_js, /"\.\/session-details\.html\?section="/);
});
