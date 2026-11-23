# مرجع واجهة البرمجة (API) — مورد

> SRS 20 بند 17. الخادم: Cloudflare Worker (`worker/src`). كل الكتابات تمر من هنا فقط؛ العملاء لا يكتبون إلى Firestore إطلاقاً.

## الأعراف العامة

| البند | القاعدة |
|---|---|
| العنوان | `https://<worker-host>` (يُضبط في `VITE_API_BASE` للويب و`BrandConfig.API_BASE` لأندرويد) |
| الهوية | `Authorization: Bearer <Firebase ID token>`؛ يتحقق الخادم من التوقيع (JWKS) والحالة (موقوف/منتهٍ) والجلسات الملغاة في كل طلب |
| الصلاحيات | تُحسب على الخادم من الأدوار + `grant` − `deny` (`spec/roles.json`، `spec/permissions.json`). فحص الواجهة شكلي فقط |
| منع التكرار | كل عملية مالية أو إنشاء طلب تتطلب `Idempotency-Key` (32 حرفاً hex). نفس المفتاح بنفس الجسم ← نفس النتيجة دون تنفيذ ثانٍ؛ بجسم مختلف ← `IDEMPOTENCY_KEY_REUSED` |
| سياق العمل | `X-Work-Context` اختياري لمن يحمل أكثر من دور؛ يُسجَّل في سجل الطلب |
| المال | أعداد صحيحة بالأغورة (`1250` = 12.50 ₪). الكمية `qtyMilli` (`1500` = 1.5). لا float في أي حقل مالي |
| الإجماليات | يعيد الخادم حساب كل إجمالي. العميل يرسل `seenTotal`، وإن اختلف السعر يرجع `PRICE_CHANGED` مع الإجمالي الجديد |
| الأخطاء | `{ "error": { "code", "message", "details?" } }` والرسالة بالعربية جاهزة للعرض |
| التتبع | كل استجابة تحمل `X-Request-Id` يظهر في سجلات الخادم |
| الحدود | الدخول: 5 محاولات فاشلة للحساب و30 لكل IP خلال 15 دقيقة ← `RATE_LIMITED`. الجسم ≤ 1MB، الصورة ≤ 5MB |

### رموز الأخطاء

| الرمز | HTTP | المعنى |
|---|---|---|
| `UNAUTHENTICATED` | 401 | رمز مفقود أو منتهٍ أو جلسة ملغاة |
| `INVALID_CREDENTIALS` / `INVALID_CODE` / `MFA_EXPIRED` | 401 | بيانات دخول أو رمز تحقق خاطئ/منتهٍ |
| `FORBIDDEN` | 403 | الصلاحية أو نطاق المحل لا يسمح |
| `ACCOUNT_SUSPENDED` / `ACCOUNT_EXPIRED` / `SHOP_SUSPENDED` | 403 | الحساب أو المحل موقوف أو منتهٍ |
| `NOT_FOUND` | 404 | غير موجود أو خارج نطاقك (لا يكشف وجود بيانات غيرك) |
| `VALIDATION` / `BAD_JSON` / `PASSWORD_WEAK` | 400 | مدخل غير صالح؛ `details.field` يحدد الحقل |
| `CONFLICT` / `PRICE_CHANGED` | 409 | تعارض حالة (تعديل متزامن) أو تغيّر سعر قبل الإرسال |
| `ALREADY_REVERSED` / `LAST_OWNER` | 400 | دفعة معكوسة سابقاً، أو محاولة إزالة آخر مالك |
| `CREDIT_LIMIT` / `CREDIT_NOT_ENABLED` / `PAYMENT_METHOD_NOT_ALLOWED` / `CANCEL_NOT_ALLOWED` | 400 | قاعدة عمل تمنع العملية؛ `details` يوضح (مثل `available` للحد المتاح) |
| `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_REUSED` | 400 | مفتاح منع التكرار (يُحفظ 7 أيام) |
| `IMAGE_TYPE` / `IMAGE_SIZE` / `IMAGE_NOT_CUTOUT` | 400 | صورة غير مقبولة (النوع، الأبعاد 64–4096، غير مفرّغة) |
| `PAYLOAD_TOO_LARGE` | 413 | الجسم أكبر من 1MB أو الصورة أكبر من 5MB |
| `TRANSITION_NOT_ALLOWED` / `ORDER_CLOSED` / `ACTOR_NOT_ALLOWED` / `GUARD_FAILED` / `REASON_REQUIRED` | 400 | انتقال حالة طلب مرفوض: غير موجود في الآلة، طلب مغلق، فاعل غير مخول، شرط لم يتحقق (توفر، حد ائتماني…)، أو سبب مطلوب |
| `RATE_LIMITED` | 429 | محاولات كثيرة |
| `TRACKING_NOT_ACTIVE` | 400 | تتبع موقع خارج مهمة نشطة |

---

## الهوية والجلسة — `api/auth.ts`, `api/mfa.ts`

| الطريقة | المسار | الوصول | الوصف |
|---|---|---|---|
| POST | `/auth/login` | عام | `{ identifier, password, remember }` ← رمز مخصص + المستخدم، أو `mfaRequired` |
| POST | `/auth/login/mfa` | عام | إكمال الدخول برمز تطبيق المصادقة |
| POST | `/auth/forgot` | عام | طلب إعادة كلمة المرور (يصل للإدارة، لا يكشف وجود الحساب) |
| GET | `/auth/me` | مسجل | المستخدم وصلاحياته وواجهته الافتراضية و`mfaAvailable` |
| POST | `/auth/change-password` | مسجل | يتطلب `currentPassword` إلا في التغيير الإجباري لأول دخول؛ يُخرج الأجهزة الأخرى |
| POST | `/auth/logout-all` | مسجل | إلغاء كل الجلسات |
| POST | `/auth/mfa/setup` · `/enable` · `/disable` | مسجل | التحقق بخطوتين، متاح فقط إن شُغّل `settings.mfaFeature` |

## الكتالوج والعروض — `api/catalog-public.ts`, `api/promotions.ts`

| الطريقة | المسار | الوصول | الوصف |
|---|---|---|---|
| GET | `/catalog` | مسجل | المنتجات والوحدات والتصنيفات والعروض النشطة والأكثر طلباً؛ مخزّن في KV بنسخة `ver` |
| GET | `/files/products/:name` | عام | صور المنتجات من R2 (عامة عن قصد، بلا بيانات خاصة) |
| GET | `/promotions` | مسجل | العروض |
| POST · PATCH | `/admin/promotions` · `/:id` | `promotions.manage` | إنشاء وتعديل وإيقاف عرض |

## الطلبات — `api/orders.ts`

| الطريقة | المسار | الوصول | الوصف |
|---|---|---|---|
| POST | `/orders/quote` | مسجل | تسعير السلة على الخادم مع الخصومات (بلا حفظ) |
| POST | `/orders` | `shop.orders.submit` + مفتاح | إرسال طلب بـ`seenTotal`؛ فحص التوفر والحد الأدنى والخطوة والحد الائتماني |
| GET | `/orders` | `orders.view` | قائمة بفلتر (`today`, `new`, `review`, `preparing`, `ready`, `delivery`, `overdue`, `completed`, `all`)؛ فلتر مجهول ← 400 |
| GET | `/orders/:id` | مسجل ضمن نطاقه | الطلب والسجل والتعديلات والإجراءات المسموحة لك الآن؛ الملاحظات الداخلية للموظفين فقط |
| POST | `/orders/:id/transition` | حسب `spec/order-states.json` + مفتاح | نقل الحالة؛ الحارس والآثار (فاتورة، قيد، SLA، تحصيل) ذرية |
| POST | `/orders/:id/changes` | `orders.edit` | طلب تعديل بنسخة قبل/بعد وسبب، ينتظر موافقة المحل |
| POST | `/orders/:id/assign` | `orders.review` | إسناد الطلب لموظف |
| POST | `/orders/:id/notes` | `orders.notes` | ملاحظة داخلية |
| GET | `/shops/:id/orders` | ضمن محلاته | طلبات محل |
| PUT · DELETE | `/drafts/:id` | `shop.orders.draft` | مسودات موظف المحل |
| GET | `/shops/:id/drafts` | ضمن محلاته | مسودات المحل للمراجعة |

## التوصيل — `api/delivery.ts`

| الطريقة | المسار | الوصول | الوصف |
|---|---|---|---|
| GET | `/agent/tasks` | `delivery.update` | مهام المندوب المسندة إليه فقط |
| GET | `/delivery/board` | `delivery.view` | لوحة التوصيل والمندوبين النشطين |
| POST | `/orders/:id/assign-agent` | `delivery.assign` | إسناد مندوب |
| POST | `/delivery/sequence` | `delivery.assign` | ترتيب مهام مندوب |
| PATCH | `/orders/:id/due` | `orders.review` أو `delivery.assign` | تعديل موعد التوصيل بسبب |
| POST · GET | `/orders/:id/track` | `delivery.update` · `delivery.track.view` | الموقع أثناء المهمة فقط |
| POST · GET | `/orders/:id/proof-upload` · `/proof/:kind` | `delivery.update` · ضمن النطاق | إثبات التسليم |

## المالية — `api/finance.ts`

| الطريقة | المسار | الوصول | الوصف |
|---|---|---|---|
| GET | `/invoices` | `invoices.view` | الفواتير |
| GET | `/invoices/:id` · `/print` | `invoices.view` أو `shop.invoices.view` لمحله | فاتورة (لا تتغير بعد إصدارها) ونسخة الطباعة |
| GET | `/shops/:id/invoices` · `/payments` | ضمن النطاق | فواتير ودفعات محل |
| GET | `/shops/:id/statement` · `/print` | `accounts.view` أو `shop.statement.view` لمحله | كشف حساب برصيد متراكم، بفترة `from`/`to` |
| POST | `/payments` | `payments.create` + مفتاح | دفعة تُوزَّع على أقدم المستحق، والزيادة رصيد دائن |
| POST | `/payments/:id/reverse` | `payments.reverse` + مفتاح | عكس دفعة بقيد معاكس (لا حذف) |
| POST | `/ledger/adjustments` | `accounts.adjust` + مفتاح | تسوية بسبب |

## المحلات — `api/admin/shops.ts`

| الطريقة | المسار | الوصول | الوصف |
|---|---|---|---|
| GET · POST | `/admin/shops` | `shops.view` · `shops.create` | قائمة المحلات؛ الإنشاء يصنع حساب المالك بكلمة مؤقتة تظهر مرة واحدة |
| PATCH | `/admin/shops/:id` | `shops.update` | البيانات والحد الائتماني وطرق الدفع |
| POST | `/admin/shops/:id/status` | `shops.suspend` | إيقاف/تفعيل بسبب |
| GET | `/shops/:id` | ضمن النطاق | ملف المحل |
| PATCH | `/shops/:id/profile` | `shop.profile.update` | تعديل المحل لبياناته المسموحة |
| GET · POST · PATCH | `/shops/:id/members` · `/:uid` | `users.manage` أو `shop.members.manage` لمحله إن فعّلته الإدارة | موظفو المحل |

## الإدارة — `api/admin/*`

| الطريقة | المسار | الوصول | الوصف |
|---|---|---|---|
| POST · PATCH · DELETE | `/admin/products` · `/:id` | `products.create` · `products.update`/`products.price.update`/`products.availability.update` · `products.delete` | المنتجات (الحذف أرشفة) |
| POST | `/admin/uploads/product-image` | `products.update` | صورة PNG مفرّغة ≤ 5MB إلى R2 |
| POST · PATCH · DELETE | `/admin/categories` · `/:id` | `categories.manage` | التصنيفات |
| PUT · DELETE | `/admin/units/:id` | `units.manage` | الوحدات |
| GET · POST · PATCH | `/admin/users` · `/:uid` | `users.manage` | الحسابات (منح/حجب صلاحيات فردية) |
| POST | `/admin/users/:uid/reset-password` · `/revoke-sessions` · `/status` | `users.manage` | كلمة مؤقتة، إخراج من الأجهزة، إيقاف |
| GET | `/admin/roles` | `roles.manage` أو `users.manage` | الأدوار والصلاحيات |
| PUT · DELETE | `/admin/roles/:id` | `roles.manage` | تحرير الأدوار |
| POST | `/admin/permissions` | `roles.manage` | صلاحية مخصصة |
| GET · PATCH | `/settings` · `/admin/settings` | مسجل · `settings.manage` | الإعدادات (ساعات العمل، العطل، SLA، الدفع، الاحتفاظ، `mfaFeature`) |
| GET | `/admin/audit` | `audit.view` | سجل العمليات بفلتر واحد (`actor`/`entity`/`action`) ومؤشر `before` |
| GET · POST | `/admin/backups` · `/run` | `backups.manage` | النسخ الاحتياطية المشفرة |

## اللوحات والتقارير — `api/me.ts`, `api/reports.ts`

| الطريقة | المسار | الوصول | الوصف |
|---|---|---|---|
| GET | `/dashboard/summary` | `orders.view` | مؤشرات الإدارة |
| GET | `/me/summary` | مسجل | لوحة المحل أو المندوب الشخصية |
| GET | `/reports` | مسجل | التقارير المتاحة لصلاحياتك |
| GET | `/reports/:name` | صلاحيات التقرير | تقرير بفترة ومحل اختياريين؛ `format=csv` للتصدير |

## الإشعارات والدعم — `api/notify.ts`, `api/support.ts`

| الطريقة | المسار | الوصول | الوصف |
|---|---|---|---|
| GET | `/notifications` | مسجل | صندوق الإشعارات وعدد غير المقروء |
| POST | `/notifications/:id/read` · `/read-all` | مسجل | تعليم كمقروء |
| POST · DELETE | `/devices` · `/:id` | مسجل | تسجيل جهاز للإشعارات الفورية (FCM) |
| POST | `/support` | `support.create` | تذكرة: استفسار أو مشكلة أو شكوى |
| GET | `/support` | مسجل | تذاكرك؛ وكل التذاكر لمن يملك `support.manage` |
| PATCH | `/admin/support/:id` | `support.manage` | رد وتغيير حالة (يصل صاحبها إشعار) |

## النظام

| الطريقة | المسار | الوصول | الوصف |
|---|---|---|---|
| GET | `/health` | عام | حالة الخدمة (بلا بيانات) |
| Cron | `* * * * *` | داخلي | كل دقيقة: الإشعارات المعلقة · كل 5 دقائق: الطلبات المتأخرة عن SLA · الدقيقة 30: الأكثر طلباً · 01:00 UTC: التسوية والنسخة المشفرة وتنظيف مفاتيح التكرار. نتيجة كل مهمة في `systemHealth/cron` |

> الجدول مولّد من تسجيل المسارات في `worker/src` (92 مساراً) ومراجَع يدوياً لكل حارس. أي مسار جديد يُضاف هنا مع صلاحيته.
