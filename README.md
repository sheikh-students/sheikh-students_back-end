# دفتر المتابعة اليومية

نظام لمتابعة حفظ ومراجعة الطلاب، مقسّم إلى قسمين مستقلين: **الأولاد** و**البنات**. الواجهة HTML/CSS/JavaScript ثابتة داخل `public/` وتُنشر مستقلة، والباك إند Node.js/Express/MongoDB داخل `src/` ويقدّم API فقط.

> **تنبيه أمني أساسي:** لا توجد حسابات أو تسجيل دخول أو صلاحيات داخل التطبيق بقرار صريح من صاحب المشروع. كل من يصل إلى الموقع يستطيع قراءة بيانات الطلاب وتعديلها وحذف الجلسات. لا تنشره على الإنترنت العام دون حماية على مستوى الشبكة أو الاستضافة. راجع [DEPLOY.md](DEPLOY.md) قبل النشر.

## المتطلبات والتشغيل

- Node.js 20 أو أحدث (`.nvmrc` يحدد الإصدار 20).
- MongoDB محلي أو MongoDB Atlas.

```bash
npm install
cp .env.example .env
# عدّل MONGODB_URI و CORS_ORIGINS ثم شغّل API:
npm start
```

### فصل الواجهة عن الباك إند

- انشر **محتويات مجلد `public/` فقط** على استضافة ملفات ثابتة مثل Cloudflare Pages أو Netlify أو Vercel.
- انشر هذا المشروع كـ Node.js API على استضافة منفصلة. لم يعد Express يقدّم HTML أو CSS أو JavaScript.
- عدّل `public/js/config.js` قبل نشر الواجهة واجعل `API_BASE_URL` هو أصل الباك إند، مثل `https://api.students.example.com`، دون `/api` في النهاية.
- في متغيرات بيئة الباك إند اضبط `CORS_ORIGINS` على أصل الواجهة حرفياً، مثل `https://students.example.com`، ويمكن إدراج أكثر من أصل مفصولاً بفواصل.
- `ALLOWED_HOSTS` خاص باسم مضيف **الباك إند** مثل `api.students.example.com`، وليس بنطاق الواجهة. `CORS_ALLOW_CREDENTIALS` يظل `false` عادةً، ويمكن تفعيله فقط عند حاجة وسيط وصول خارجي إلى Cookie مع ضبط `INCLUDE_CREDENTIALS` في إعداد الواجهة.
- أثناء التطوير شغّل الواجهة عبر خادم ملفات ثابتة على `http://localhost:5500` (مثلاً `python3 -m http.server 5500 --directory public`)، وأضف هذا الأصل إلى `CORS_ORIGINS`.

CORS يحدد المتصفحات التي يمكنها قراءة ردود API فقط، ولا يُعد تسجيل دخول أو حاجز وصول. يجب حماية الواجهة والـ API معاً عبر Cloudflare Access أو VPN/شبكة خاصة؛ لا تنشر API مكشوفاً لأن التطبيق بلا حسابات.

للتطوير: `npm run dev`. لفحص الصياغة: `npm run lint`، والاختبارات: `npm test`.

### تشغيل MongoDB للاختبارات محلياً (موصى به)

الاختبارات تحذف مستندات قاعدة الاختبار ثم تحذف قاعدة الاختبار نفسها في النهاية. لا تستخدم قاعدة الإنتاج أو نفس مستخدمها ومضيفها.

```bash
docker run --name sheikh-students-test-mongo --rm -d -p 27018:27017 mongo:7
```

ضع في `.env`:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/sheikh_students
MONGODB_URI_TEST=mongodb://127.0.0.1:27018/sheikh_students_test
```

ثم شغّل `npm test`. يرفض الاختبار رابطاً يشارك قاعدة الإنتاج أو نفس المضيف واسم المستخدم، ويتحقق من أن اسم قاعدة الاختبار يحتوي `test`. عند `CI` يُقبل localhost، أو URI بعيد منفصل تماماً عن URI الأساسي. لا تعِد استخدام `sheikh_students_test` لبيانات حقيقية.

### Docker Compose

```bash
docker compose up --build -d
docker compose logs -f app
```

يشغّل Compose الباك إند وقاعدة MongoDB فقط، ويربط API على `127.0.0.1:3000` محلياً. الواجهة مستقلة وتُنشر من مجلد `public/`.

## طريقة الاستخدام

1. اختر قسم الأولاد أو البنات.
2. أضف الطلاب من صفحة الطلاب.
3. أنشئ جلسة بتاريخها.
4. أضف صفاً لكل طالب، واستخدم أقسام المتابعة النشطة (نصي أو من/إلى).
5. اطبع تقرير الجلسة. يحتفظ كل صف باسم الطالب واسم العمود وقت التسجيل حتى لا تتغير التقارير القديمة عند إعادة التسمية.

## عقد الاستجابات

الاستجابات الناجحة تحتفظ بالشكل `{ "success": true, "data": ... }`. الإخفاقات تستخدم `{ "success": false, "message": "رسالة عربية" }`. قد تضاف `meta` فقط إلى قوائم الطلاب والجلسات عند تفعيل pagination، ويظل `data` مصفوفة حتى تبقى الواجهة الحالية متوافقة.

## مسارات API

القيمة `section` مطلوبة في طلبات الطلاب والجلسات ولوحة الإحصائيات وقائمة الأقسام.

| Method | المسار | المدخلات / الوظيفة |
|---|---|---|
| GET | `/api/health` | فحص اتصال MongoDB؛ يعيد 200 أو 503 دون تفاصيل حساسة |
| GET | `/api/meta` | `sections`, `grades`, `fieldKinds`, `limits` كمرجع موحد للثوابت |
| POST | `/api/students` | `{ name, section }`؛ ينشئ طالباً نشطاً |
| GET | `/api/students?section=boys&search=احمد&active=true&limit=50&skip=0` | قائمة الطلاب؛ البحث مطبّع عربياً؛ `active` اختياري: `true` أو `false` |
| PATCH | `/api/students/:id` | `{ name?, isActive? }`؛ لا يمكن تغيير القسم |
| GET | `/api/fields?section=boys&active=true` | أقسام المتابعة؛ `active=true` يعرض النشطة فقط |
| POST | `/api/fields` | `{ section, name, kind }` و`kind` إما `text` أو `range` |
| PATCH | `/api/fields/:id` | `{ name? }` أو `{ isActive? }` أو `{ move: "up"|"down" }` |
| POST | `/api/sessions` | `{ section, date, title?, endDate? }` |
| GET | `/api/sessions?section=boys&limit=50&skip=0` | ملخص الجلسات الأحدث أولاً، `data` مصفوفة و`meta` اختياري |
| GET | `/api/sessions/:id` | تفاصيل جلسة وصفوف تقييمها |
| PATCH | `/api/sessions/:id` | عمليات الجلسة أدناه؛ لا يتغير اسم `action` |
| DELETE | `/api/sessions/:id` | حذف جلسة وكل تقييماتها |
| GET | `/api/sessions/:id/report` | أعمدة وصفوف التقرير للطباعة |
| GET | `/api/dashboard?section=boys` | إحصائيات القسم وآخر خمس جلسات |

### عمليات PATCH للجلسة

كل العمليات تبقى عبر `PATCH /api/sessions/:id`:

| `action` | جسم الطلب |
|---|---|
| `update_session` | `{ action, title?, date?, endDate? }` |
| `add_evaluation` | `{ action, studentId, entries: [{ fieldId, content?, from?, to?, grade? }] }` |
| `update_evaluation` | `{ action, evaluationId, entries, expectedUpdatedAt? }` |
| `delete_evaluation` | `{ action, evaluationId }` |

مثال إضافة صف لقسم نصي:

```json
{
  "action": "add_evaluation",
  "studentId": "507f1f77bcf86cd799439011",
  "entries": [{
    "fieldId": "507f1f77bcf86cd799439012",
    "content": "سورة الرعد كاملة",
    "grade": "ممتاز"
  }]
}
```

مثال تعديل متفائل يمنع الكتابة فوق تعديل تبويب آخر:

```json
{
  "action": "update_evaluation",
  "evaluationId": "507f1f77bcf86cd799439013",
  "expectedUpdatedAt": "2026-11-08T08:00:00.000Z",
  "entries": [{ "fieldId": "507f1f77bcf86cd799439012", "content": "تمت المراجعة" }]
}
```

`expectedUpdatedAt` اختياري للتوافق مع الواجهة القديمة. عند اختلافه يعاد HTTP 409 والرسالة: «تم تعديل هذا الصف من مكان آخر، أعد تحميل الصفحة».

### حدود وقواعد البيانات

- 20 قسماً كحد أقصى لكل قسم من أقسام الموقع، ويُرفض التجاوز بـ 409.
- 500 تقييم كحد أقصى داخل الجلسة.
- 31 يوماً كحد أقصى بين `date` و`endDate`، والسنوات المقبولة 2000 إلى 2100.
- قسم `text` يحفظ `content` فقط، وقسم `range` يحفظ `from` و`to` فقط.
- لا تُضاف بيانات جديدة إلى قسم متابعة معطّل، لكن يُسمح بتعديل صف قديم ما دام القسم موجوداً بالفعل فيه.
- قيم `limit` الافتراضية 50 والحد الأقصى 100؛ `skip` الافتراضي 0. جميع قيم pagination اختيارية.
- أسماء الطلاب تُطبع للبحث بإزالة التشكيل والتطويل وتوحيد الألف والياء والتاء المربوطة، والترتيب يستخدم Arabic collation.

### رموز الأخطاء

| HTTP | المعنى |
|---|---|
| 400 | مدخلات غير صالحة أو JSON غير صحيح |
| 403 | قيمة Host غير مسموح بها |
| 404 | المسار أو السجل غير موجود |
| 405 | طريقة HTTP غير مسموح بها؛ ترويسة `Allow` تحدد الطرق المتاحة |
| 409 | تعارض، تكرار، حد أقصى، أو تعارض تحديث صف |
| 413 | جسم الطلب أكبر من 50KB |
| 415 | ترميز طلب غير مدعوم |
| 429 | تجاوز حد الطلبات |
| 500 | خطأ داخلي برسالة عربية عامة |
| 503 | قاعدة البيانات غير متاحة |

## الأمان والتشغيل

- `HOST` افتراضياً `127.0.0.1`. لا تفتحه على الشبكة إلا خلف وصول خارجي محمي.
- `ALLOWED_HOSTS` قائمة اختيارية مفصولة بفواصل لأسماء المضيفين المقبولة.
- `TRUST_PROXY` يحدد الوكلاء الموثوقين عند استخدام Reverse Proxy؛ الافتراضي لا يثق بأحد.
- حدود معدل الطلبات: 600 طلب عام و120 عملية كتابة لكل 15 دقيقة لكل عنوان IP.
- بيانات API تستخدم `Cache-Control: no-store`. إعدادات التخزين المؤقت لملفات HTML/CSS/JS تُدار من استضافة الواجهة الثابتة.
- HSTS يعمل في production افتراضياً (إلا إذا `ENABLE_HSTS=false`).
- الترحيلات تسجّل في مجموعة `schema_migrations` بقفل من قاعدة البيانات لمنع التنفيذ المتزامن.
- لا توجد مسارات نسخ احتياطي/استعادة داخل التطبيق؛ النسخ من Atlas أو `mongodump` خارج الموقع فقط.

تفاصيل حاجز الوصول والنسخ الاحتياطي وHTTPS في [DEPLOY.md](DEPLOY.md).
