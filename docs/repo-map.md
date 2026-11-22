# خريطة المستودع — مورد

## الميزة ← الملف
| الميزة | الملف | ملاحظة |
|---|---|---|
| النص المرجعي للمتطلبات | `docs/SRS.md` | لا يُعدَّل |
| قائمة المتطلبات وحالتها | `docs/requirements-checklist.md` | تُحدَّث عند إغلاق كل وحدة |
| المعمارية والانحرافات D1–D10 | `docs/architecture.md` | |
| مجموعات Firestore والفهارس والقواعد الحسابية | `docs/data-model.md` | |
| خارطة الوحدات وشروط إغلاقها | `docs/roadmap.md` | |
| كتالوج الصلاحيات (56) | `spec/permissions.json` | scope: staff/shop/agent/any |
| الأدوار التسعة والتوجيه بعد الدخول | `spec/roles.json` | super_admin محمي `*` |
| آلة حالات الطلب (14 حالة، 30 انتقالاً) | `spec/order-states.json` | guards + effects ينفذها الخادم |
| التصنيفات والوحدات والإعدادات الأولية | `spec/seed.json` | |
| اختبارات اتساق المواصفات | `tests/spec.test.mjs` | 18 اختباراً |
| مفاهيم الشعار v2 (خاتم، بوابة، M بالنقطة) | `brand/logo/v2/marks.py` (مولّد الرموز بالألوان)، `textpath.py` (نص ← مسار بـharfbuzz) | الكلمات مسارات لا خطوط حية |
| حزمة الشعار النهائية «M بالنقطة» | `brand/logo/final/kit.py` (يولّد svg/ web/ android/)، `png/`، `sheet.py` ← `mawred-identity-sheet.png` | نسخة صغيرة ≤32px بخط أسمك ونقطة أبعد |
| رموز ألوان الهوية (HEX + OKLCH + تباين) | `spec/brand.json` | مصدر BrandConfig.kt |
| رموز نظام التصميم (ألوان فاتح/داكن، خطوط، مسافات، حركة) | `spec/design-tokens.json`، `docs/design-system.md` | تباين مختبر في `tests/design.test.mjs` |
| دليل استخدام الشعار | `brand/guidelines.md` | |
| أيقونة أندرويد التكيفية | `brand/logo/final/android/` | تُنسخ إلى `android/app/src/main/res/` في M10 |
| اختبارات حزمة الشعار | `tests/brand.test.mjs` | 6 اختبارات |
| لوحة العرض للعميل | `brand/logo/v2/build_board.py` ← `board.html`، `slides/*.png`، `mawred-logo-presentation.png/jpg` | خطوط Amiri/El Messiri/Alexandria/Aref Ruqaa من الدماغ |
| نواة المنطق (بلا I/O) | `worker/src/domain/*.ts` | money، quantity، catalog، pricing، promotions، fsm، permissions، ledger، sla، search، numbering، idempotency، result |
| اختبارات النواة + سيناريوهات SRS 19.3 | `worker/test/*.test.ts` | `cd worker && npm run coverage` (عتبة 95%) |
| واجهة قاعدة البيانات + تنفيذ ذاكرة للاختبار | `worker/src/infra/db.ts`، `memory-db.ts` | كل منطق الخادم يعتمد الواجهة لا Firestore مباشرة |
| عميل Firestore REST (معاملات، استعلامات، ترميز القيم) | `worker/src/infra/firestore.ts` | إعادة محاولة عند ABORTED |
| JWT حساب الخدمة، رمز OAuth، custom token، تحقق ID token | `worker/src/infra/google.ts` | WebCrypto بلا مكتبات |
| Firebase Auth REST | `worker/src/infra/identity.ts` | |
| حد المحاولات (KV) | `worker/src/infra/ratelimit.ts` | 5/15د لكل معرّف، 30/15د لكل IP |
| أخطاء HTTP، موجّه، تنظيف المدخلات | `worker/src/api/http.ts` | |
| سياق الطلب، RBAC، الوصول للمحل، التدقيق، idempotency | `worker/src/api/context.ts` | |
| الدخول الموحد وما يتبعه | `worker/src/api/auth.ts` | /auth/login، me، change-password، logout-all، forgot |
| معالج الطلبات (CORS، الجلسة، كلمة المرور المؤقتة، إخفاء الأخطاء) | `worker/src/api/app.ts` | |
| نقطة دخول Worker وإعداده | `worker/src/index.ts`، `worker/wrangler.toml` | الأسرار عبر wrangler secret؛ `npm run check` = typecheck + coverage + bundle |
| قواعد Firestore | `firebase/firestore.rules` | لا كتابة لأي عميل؛ القراءة بـclaims (rp/k/sh) |
| الفهارس المركّبة + TTL للـidempotency | `firebase/firestore.indexes.json` | |
| اختبارات القواعد بالمحاكي | `firebase/test/rules.test.ts` | `cd firebase && npm test` (يحتاج Java 21) |
| CI القواعد | `.github/workflows/firebase.yml` | |
| إنشاء الحسابات وقواعد المنح ومنع آخر مالك وclaims | `worker/src/api/admin/accounts.ts` | `createAccountOnce` = منع تكرار بلا إعادة كشف كلمة المرور |
| المستخدمون: قائمة، إنشاء، تعديل، إيقاف، إعادة كلمة المرور، إلغاء الجلسات | `worker/src/api/admin/users.ts` | |
| الأدوار المخصصة والصلاحيات المضافة وقت التشغيل | `worker/src/api/admin/roles.ts` | super_admin والأدوار الأساسية لا تُحذف |
| المحلات وصاحبها، الائتمان، الإيقاف، ملف المحل الذاتي، موظفو المحل | `worker/src/api/admin/shops.ts` | MEMBER_PERMS |
| التصنيفات، الوحدات، المنتجات (SKU فريد في `skus/`)، رفع الصور المفرّغة وخدمتها | `worker/src/api/admin/catalog.ts` | فصل صلاحية السعر والتوفر |
| الإعدادات العامة بتحقق صارم | `worker/src/api/admin/settings.ts` | |
| تخزين الملفات وفحص صور PNG/WebP بالشفافية | `worker/src/infra/files.ts` | R2 |
| تجميع المسارات | `worker/src/api/routes.ts` | |
| التهيئة الأولى (بذر + مالك النظام مرة واحدة) | `worker/src/admin/bootstrap.ts`، `worker/scripts/bootstrap.ts` | `npm run bootstrap` |
| الطلبات: تسعير مسبق، إرسال، انتقالات، تعديل وموافقة، ملاحظات، تعيين، قوائم، مسودات | `worker/src/api/orders.ts` | الآثار المالية داخل نفس المعاملة |
| النواة المالية: ترقيم، فاتورة، إلغاء فاتورة، مرتجع، دفعة بتخصيص، تحديث الرصيد | `worker/src/api/finance-core.ts` | `postLedger` يحدّث `shops.balance` بنفس المعاملة |
| الإشعارات: صندوق، مهام إرسال، FCM، الأجهزة، معالجة المستحق | `worker/src/api/notify.ts`، `worker/src/infra/fcm.ts` | |
| المهام المجدولة | `worker/src/api/cron.ts` | كل دقيقة الإشعارات، كل 5 دقائق التأخير، يومياً التسوية |
| المالية: الدفعات، العكس، التسويات والرصيد الافتتاحي، الكشف، الفواتير، الطباعة، التسوية التلقائية | `worker/src/api/finance.ts` | |
| صفحات طباعة الفاتورة والكشف (RTL، تهريب كل النصوص، CSP) | `worker/src/api/print.ts` | |
| العروض: قائمة، إنشاء بتحقق الأنواع، تعديل، إشعار المحلات | `worker/src/api/promotions.ts` | |
| التقارير الـ17 + CSV + HTML | `worker/src/api/reports.ts` | `REPORT_NAMES` |
| الدعم والشكاوى | `worker/src/api/support.ts` | |
| النسخ الاحتياطي المشفر والاستعادة | `worker/src/api/backup.ts`، `worker/src/infra/blobs.ts` | `COLLECTIONS` يجب أن يشمل كل مجموعة (اختبار)؛ idempotency مستثناة عمداً |
| التوصيل: الإسناد، الترتيب، اللوحة، مهام المندوب، التتبع، ملفات الإثبات الخاصة، الموعد المؤكد، وسم المتأخر | `worker/src/api/delivery.ts` | |
| CI الخادم | `.github/workflows/worker.yml` | typecheck + coverage |
| CI للمواصفات | `.github/workflows/spec.yml` | |

## القرارات وأسبابها
- 2026-11-20 — Kotlin + Compose بدل Java (D1): قالب ساجد الجاهز ومعياره.
- 2026-11-20 — Firebase + Workers بدل Spring Boot/PostgreSQL (D2): بلا سيرفر مدفوع؛ السلامة المالية تُفرض في `worker/domain` ومعاملات Firestore.
- 2026-11-20 — العميل يقرأ مباشرة بقواعد صارمة ولا يكتب أبداً (D5): تحديث حي + offline دون كسر «الخادم مصدر الحقيقة».
- 2026-11-20 — R2 للصور (D6): Firebase Storage يحتاج Blaze.
- 2026-11-20 — `orders.create` في الوثيقة = `shop.orders.draft` + `shop.orders.submit` (D10) لدعم SRS 2.7.
- 2026-11-20 — إلغاء المحل مسموح في new/under_review/awaiting_shop_approval فقط (`settings.shopCancelStates`).
- 2026-11-20 — موافقة المحل على التعديل تؤكد الطلب مباشرة؛ الرفض يعيده للمراجعة.
- 2026-11-20 — احتفاظ النسخ الاحتياطية 30 يوماً (قابل للضبط) لأن RPO للنظام المالي أهم من افتراضي 3 أيام للتطبيقات المحلية.

- 2026-11-20 — العطلة الأسبوعية: كل الأسبوع أيام عمل افتراضياً، وتُضبط لاحقاً من الإعدادات (قرار ساجد).
- 2026-11-20 — صور المنتجات مفرّغة دائماً وتظهر فوراً للجميع؛ التفريغ على الجهاز (ML Kit على أندرويد، أدوات متصفح على الويب) والخادم يرفض صورة بلا شفافية (قرار ساجد).
- 2026-11-20 — لوحة الإدارة تدير كل كيان (طلب ساجد) — R11.4.
- 2026-11-20 — رفض ساجد مفهومي «منبع» والكتابة الكوفية؛ أُبقي «M بالنقطة» وأضيف «خاتم مورد» (نجمة ثمانية + عملة ذهبية + ميم) و«بوابة مورد» (قوس عربي + ميم رقعة)، بعرض ملون فاخر لصاحب المشروع.
- 2026-11-20 — اعتمد ساجد «M بالنقطة» (أزرق #1D4ED8 + برتقالي #F08A24). البرتقالي على الأبيض تباينه 2.5 فقط ← لا يُستخدم لنصوص الواجهة على خلفية فاتحة.
- 2026-11-20 — الشعار مقدَّم كخطوة أولى (M9a) قبل M1 بطلب ساجد؛ لا يخالف SRS 22-1 لأنه ليس واجهة.

- 2026-11-20 — الخصومات: أفضل عرض واحد لكل سطر (لا تكديس)، وسقف الخصم يوزَّع على أسطر العرض بالترتيب.
- 2026-11-20 — إلغاء طلب مفوتر: إشعار دائن بكامل الفاتورة، والمدفوع يبقى رصيداً دائناً أو يُردّ (`refund`) بقرار الموظف.
- 2026-11-20 — المهلة تُحسب على ساعات استقبال الطلبات (06:00–23:00) بتوقيت Asia/Gaza مع التوقيت الصيفي عبر Intl بلا مكتبات.

- 2026-11-20 — الدخول: فهرس `logins/{e:|p:|u:}` يحوّل المعرّف إلى بريد دخول داخلي، ثم Identity Toolkit، ثم custom token بـclaims مختصرة للقواعد (rp، k، sh).
- 2026-11-20 — الصلاحيات تُحسب من وثيقة المستخدم في كل طلب (لا ثقة بالـclaims في الخادم)؛ الـclaims للقواعد فقط.
- 2026-11-20 — كلمة المرور المؤقتة تغلق كل المسارات عدا me/change-password/logout-all.
- 2026-11-20 — idempotency: وثيقة `idempotency/{uid}_{key}` تُنشأ داخل نفس معاملة العملية، مع expireAt لـTTL سبعة أيام.

- 2026-11-20 — حساب موقوف يحتفظ بقراءة Firestore حتى ساعة (عمر ID token) لأن القواعد تعتمد claims؛ كل الكتابات عبر الخادم الذي يفحص الحالة فوراً، والإيقاف يعطّل حساب Firebase فيفشل التجديد.

- 2026-11-20 — لا أحد يمنح صلاحية لا يملكها؛ دور super_admin يمنحه مالك النظام فقط؛ تعديل الأدوار/الصلاحيات/المحلات يلغي الجلسات ويحدّث claims.
- 2026-11-20 — إعادة طلب إنشاء حساب بنفس المفتاح تعيد المعرّف بلا كلمة المرور (لا تُخزَّن كلمة مرور في سجلات منع التكرار)؛ عند ضياعها تُعاد بإعادة التعيين.
- 2026-11-20 — صاحب المحل يعدّل الهاتف البديل والعنوان والموقع فقط؛ الباقي للإدارة.
- 2026-11-20 — صور المنتجات: رفع خام ← فحص بايتات (PNG بقناة ألفا/tRNS أو WebP VP8X/VP8L بألفا) ← R2 ← ربط بالمنتج؛ عرضها عام ومخزّن سنة.

- 2026-11-20 — كل فاتورة تُقيَّد في الدفتر نقدية أو آجلة (`post_ledger`)، والتحصيل عند التسليم دفعة؛ بهذا يبقى الرصيد صحيحاً لكل الطرق.
- 2026-11-20 — الفاعل في الانتقال يُستنتج من المستخدم والطلب (staff/shop/agent) لا من الجسم.
- 2026-11-20 — تعديل طلب مفوتر: الموافقة تلغي الفاتورة القديمة بإشعار دائن وتصدر جديدة.
- 2026-11-20 — المرتجع يُحسب بسعر الفاتورة مع حصته النسبية من الخصم ولا يتجاوز المفوتر.
- 2026-11-20 — مسودات المحل في `drafts/` يقرؤها أعضاء المحل فقط.

- 2026-11-20 — المندوب يرى من الفاتورة المبلغ المطلوب تحصيله نقداً فقط، لا رصيد المحل.
- 2026-11-20 — تغيير المندوب مسموح حتى out_for_delivery؛ بعد on_the_way يحتاج تعذر تسليم ثم إعادة جدولة.
- 2026-11-20 — المتأخر يأخذ موعداً تقديرياً جديداً بعد ساعتي عمل ويُوسم مرة واحدة.

- 2026-11-20 — قراءات المعاملة لا ترى كتاباتها المعلّقة (Firestore REST والذاكرة): التسوية بعد الدفع تعتمد نتيجة التخصيص لا إعادة قراءة الفاتورة.
- 2026-11-20 — الطلب يصبح «مكتملاً مالياً» لحظة سداد فاتورته إن كان مسلّماً، مع Cron يومي احتياطي.

- 2026-11-20 — النسخ: `dump` بـcollectionGroup (allDescendants) مرتب بالمسار، JSONL بتواريخ مرمّزة، gzip، AES-GCM بمفتاح سري 32 بايت، صيغة `MWB1|iv|ct`.
- 2026-11-20 — CSV يبدأ بـBOM لفتحه عربياً في Excel، والخلايا التي تبدأ بـ= + - @ تُسبق بفاصلة عليا لمنع حقن الصيغ.

- 2026-11-20 — M9 بلا توقف لاختيار اتجاه: الاتجاه محسوم بالشعار المعتمد وبطلب ساجد الاستمرار دون توقف؛ خطوط Alexandria للعناوين وIBM Plex Sans Arabic للنصوص.

## أخطاء محلولة
- `node --test tests/` يفشل على Node 22 (يعامل المجلد كملف) ← استخدم `node --test tests/*.test.mjs`.

- concept_sheet في مهارة logo-design يقص حدود الرسم على bbox الهندسي ويتجاهل سماكة stroke ← وسّع الخطوط إلى أشكال مملوءة قبل لوحة المفاهيم.

- خط Aref Ruqaa يدمج ميم «مورد» الابتدائية فتُقرأ «سورد» ← لا يُستخدم لكلمة «مورد» كاملة؛ يصلح للميم المفردة فقط.

- أعلام أقواس Android vector كانت تُكتب «1.000» فتختفي الدوائر ← تُكتب 0/1 صحيحة، واختبار يمنع العودة.

- npm 10 يفشل بـ`edgesOut` مع vitest 4 ← `legacy-peer-deps=true` في `worker/.npmrc`.

- CI فشل في M2 لأن typecheck لم يُشغَّل محلياً على ملفات الاختبار ← `npm run check` قبل كل commit.

- معاملة داخل معاملة (idempotent يلف createAccount) علّقت MemoryDb ← `createAccountOnce` يكتب وثيقة المفتاح داخل معاملة الإنشاء نفسها.

- استيراد ملف اختبار من ملف اختبار آخر يعيد تشغيل اختباراته ← الأدوات المشتركة في `test/images.ts` و`test/order-world.ts`.

## قضايا مفتوحة
- MFA الإداري يحتاج ترقية Identity Platform (D7) — قبل الإطلاق.
- اسم المورد وبياناته ورقم التواصل للفاتورة — تُدخل من الإعدادات عند التشغيل.

## الويب (web/) — M13a
- الدخول والتوجيه: `web/src/App.tsx` (admin.* / agent.* / shop.* + فرض تغيير كلمة المرور المؤقتة)، `src/Login.tsx`، `src/lib/session.tsx` (AuthBackend مجرّد، `/auth/login` ← custom token).
- العميل: `src/lib/api.ts` (Bearer + x-work-context + idempotency-key، أخطاء عربية، NETWORK).
- المحل: `src/shop/ShopApp.tsx` (كتالوج من `useCatalog` بكاش offline، السلة `lib/cart.ts` بمفتاح محاولة ثابت، PRICE_CHANGED ← seenTotal، تتبع ومؤقت SLA، كشف الحساب والطباعة عبر `openPrintable`).
- الإدارة: `src/admin/AdminApp.tsx` (Dashboard + Sparkline SVG، Orders + AdminOrder، Delivery board، Reports + CSV). الأقسام تظهر حسب الصلاحية فقط.
- المندوب: `src/agent/AgentApp.tsx` (مهمة حالية، اتصال/ملاحة، تسليم بإثبات ومبلغ، تعذّر).
- PWA: `public/sw.js` (هيكل مخزّن، صور المنتجات cache-first، لا تخزين لـ POST ولا للبيانات المالية)، `src/ui/InstallPrompt.tsx`.
- التصميم: `scripts/tokens.mjs` يولّد `src/tokens.css` من `spec/design-tokens.json`؛ `src/styles.css`.
- قرار: `@vitejs/plugin-react@5` لأن v6 تتطلب vite 8 (خطأ `./internal` غير مُصدَّر).
- قرار: التفاعل التوقيعي يتحقق من `Element.prototype.animate` قبل الاستخدام.

## الويب — M13b (لوحة الإدارة الشاملة)
- `web/src/admin/kit.tsx`: useLoad/useAction، `toAgorot` (نص ← أغورة صحيحة بلا float)، Field/Loading.
- `admin/Products.tsx`: قائمة + توفر بنقرة، نموذج منتج (وحدات، أسعار بالأغورة، تكلفة لمن يملك products.cost.view، أرشفة)، التصنيفات (إضافة/تسمية/حذف)، الوحدات (PUT).
- `lib/cutout.ts`: تفريغ الخلفية بالتعبئة من الحواف + حافة ناعمة؛ يتخطى الصور المفرّغة أصلاً؛ الخادم يرفض غير الشفاف (IMAGE_NOT_CUTOUT).
- `admin/Shops.tsx`: إنشاء محل + حساب صاحبه (كلمة مؤقتة تُعرض مرة)، تعديل/حد ائتماني، إيقاف/تفعيل بسبب، كشف الحساب.
- `admin/Users.tsx`: مستخدمون (منح/حجب فردي، إعادة تعيين كلمة المرور، إنهاء الجلسات، إيقاف)، محرر الأدوار.
- `admin/Finance.tsx`: دفعة بمفتاح idempotency يتجدد بعد النجاح، عكس بسبب، تسوية مدين/دائن/افتتاحي، الفواتير وطباعتها.
- `admin/More.tsx`: العروض، الإعدادات (أيام العمل/العطلات/طرق الدفع)، النسخ الاحتياطي، الدعم.
- إصلاح: CORS كان لا يسمح بـ PUT (الوحدات والأدوار) — أضيف مع اختبار.

## Android (android/) — M10
- البناء: `android/app/build.gradle.kts` (مهمة `generateTokens` تولّد `DesignTokens` من spec/design-tokens.json؛ `copySpec` تنسخ order-states/roles/permissions إلى assets؛ versionCode = GITHUB_RUN_NUMBER؛ API_URL وFIREBASE_API_KEY من متغيرات CI).
- الهوية: `BrandConfig.kt`، `ui/theme/Oklch.kt` (تحويل OKLCH→sRGB + تباين WCAG)، `Theme.kt` (RTL إجباري)، `Type.kt` (Alexandria متغير + IBM Plex Sans Arabic)، `ui/Icons.kt` (نفس مسارات الويب، الاتجاهية autoMirror) و`LogoMark`.
- الجلسة: `data/auth/AuthRepository.kt` (login → customToken → IdentityRest.exchange، تحديث قبل الانتهاء بدقيقة، 401 ← خروج، بلا نت ← جلسة محفوظة)، `KeystoreCipher` + `DataStoreSessionStore`.
- البيانات: `data/api/Api.kt`، `data/Catalog.kt` (شبكة أولاً ثم كاش Room)، `data/local/Database.kt` (cache، cart_lines، outbox؛ Migrations.ALL إلحاقي)، `CartRepository`.
- محرك schema: `schema/Schema.kt` (validate بأنواع MONEY/QTY/PHONE/SELECT/DATE وصلاحيات الحقول، filter بتطبيع عربي، display).
- الواجهات: `ui/MawredRoot.kt` (توجيه بالجلسة والدور)، `screens/AuthScreens.kt`، `shop/ShopScreens.kt` (كتالوج + سلة)، `admin/AdminScreens.kt` (مؤشرات + sparkline)، `agent/AgentScreens.kt`، `screens/TestScreen.kt` (7 نقرات على الشعار).
- التحديث: `update/UpdateChecker.kt` (آخر Release، مقارنة رقم البناء، تنزيل في مجلد التطبيق، حذف بعد التثبيت).
- قرار: النص فوق البرتقالي لون ثابت `ON_ACCENT_HEX` (accentInk مخصص للنص على السطح فقط) — كشفه اختبار التباين.

## Android — M11 (المحل)
- `data/Orders.kt`: `OrderRepository` — submit يحفظ في outbox أولاً بمفتاح ثابت ثم يرسل؛ NETWORK/5xx ← Queued؛ PRICE_CHANGED ← يبقى بعلامة `PRICE_CHANGED:<total>` وflush يتخطاه حتى الموافقة؛ acceptPrice يعيد الإرسال بنفس المفتاح + seenTotal؛ رفض منطقي (4xx) ← يُحذف ويظهر الخطأ العربي.
- `data/OutboxWorker.kt`: WorkManager بشرط الشبكة وتراجع أُسّي، عبر Hilt EntryPoint.
- `ui/shop/ShopViewModel.kt` (CheckoutUi)، `ShopScreens.kt` (السلة: طريقة الدفع والملاحظات والإرسال وحوار السعر)، `OrderScreens.kt` (طلباتي، التفاصيل بالمراحل ومؤقت SLA بتوقيت غزة والإجراءات، كشف الحساب).
- `ApiException.details` يحمل تفاصيل الخادم (مثل total في PRICE_CHANGED).

## Android — M12 (الإدارة والمندوب)
- `data/Admin.kt`: AdminRepository (orders?filter، agents من /delivery/board، assign-agent، PATCH التوفر، addImage: رفع PNG ثم PATCH images مع الإبقاء على السابقة، deliver بإثبات).
- `data/Cutout.kt`: ML Kit Subject Segmentation (foregroundBitmap) → PNG شفاف ≤1600px؛ النموذج يُثبت مع التطبيق (meta-data subject_segment).
- `Api.upload`: رفع ثنائي بنوع المحتوى وأخطاء عربية.
- `ui/admin/AdminOrders.kt`: AdminOrdersScreen/AdminProductsScreen؛ التبويبات تظهر حسب الصلاحية في `MawredRoot`.
- `ui/agent/AgentScreens.kt`: TaskActions (on_the_way، delivered، delivery_failed).
- قرار: Android للإدارة الميدانية السريعة (الطلبات، التوفر، الصور)؛ الإدارة الكاملة (المستخدمون، المالية، الإعدادات…) على الويب.

## الويب — M13c (E2E)
- `web/playwright.config.ts` يبني الإنتاج ويشغّل `vite preview`؛ `e2e/mock.ts` يعترض Identity Toolkit (JWT غير موقّع يكفي للـ SDK) و`api.mawred.test`.
- `e2e/flows.spec.ts`: المحل (دخول→بحث→وحدة كرتونة→سلة→إرسال بمفتاح idempotency وBearer→تتبع SLA→إعادة تحميل)، المدير (المؤشرات، أقسام حسب الصلاحية، الطلبات، التقارير)، التوافق (320/390/768 بخط 150% بلا تمرير أفقي). فشل يُسقط الاختبار عند أي pageerror.
- إصلاح كشفه E2E: شريط الإدارة على الجوال كان يحتل نصف الشاشة؛ صار شريطاً مضغوطاً لاصقاً بتنقل أفقي، وscroll-snap صار proximity.
- إصلاح كشفه WebKit E2E: نافذة تثبيت آيفون كانت تغطي زر «دخول»؛ صارت لا تظهر في شاشة الدخول وتظهر بعد الدخول بمهلة 20 ثانية.
- E2E: الخادم المُحاكى على نفس الأصل (`/__api`) وخدمة العمل محجوبة أثناء الاختبار؛ WebKit تحت Playwright يفشل في preflight المُعترَض (الخادم الحقيقي يرسل CORS صريحة ومُختبرة).

## v0.2.0
- الطلب السريع: `worker/src/domain/quickorder.ts` (مصدر القواعد) ← `web/src/shop/ShopApp.tsx` (QuickOrder) و`android/.../core/QuickOrder.kt` (منفذ مطابق، نفس حالات الاختبار). `Product.defaultUnitId` + `defaultUnit()`.
- علامة مورد: `web/src/lib/cutout.ts` (markRect/stampMark) و`android/.../data/Watermark.kt` و`catalog/packshots.py` — نفس قاعدة المكان.
- الكتالوج: `catalog/build_seed.py` → `seed.json`، `catalog/packshots.py` → `images/`، `worker/scripts/import-catalog.ts` يستورد عبر createApp الحقيقي (R2 عبر Cloudflare REST، مفتاح idempotency حتمي لكل SKU) كمسودات.
- إدارة Android الكاملة: `ui/admin/AdminVm.kt` (نموذج JSON عام) + `ui/admin/AdminMore.kt` (9 أقسام) تحت تبويب «المزيد».

## v0.3.0 — العمل بلا نت والتنقل للتفاصيل
- تذكرني ويب: `web/src/lib/session.tsx` (`rememberLogin`/`rememberedLogin`، `login(id,pw,remember)`، `adopt(customToken)`) + `firebase.ts` (local/session persistence) + `Login.tsx`.
- تذكرني أندرويد: `data/auth/SessionStore.kt` (`LoginPrefs`)، `DataStoreSessionStore` (login_id, remember)، `AuthRepository.login(remember)` و`persist()`؛ الشاشة `AuthScreens.LoginScreen(prefs)`.
- النسخة المحلية لكل مستخدم ويب: `web/src/lib/offline.ts` (`cachePut/cacheGet/clearOffline/useStale`، مفتاح `mawred.c.<uid>.<path>`)، و`Api.scope` في `api.ts` يحفظ كل GET ناجح ويعيده عند NETWORK؛ `App.tsx StaleBanner`.
- أندرويد: `ReadCache` في `data/api/Api.kt` + `RoomReadCache` في `data/local/Database.kt` (مفتاح `r:<uid>|<path>`)؛ `Api.stale` → شريط بلا اتصال في `MawredRoot`.
- صادر الويب: `web/src/lib/outbox.ts` (`enqueue/flushOutbox/useOutbox/systemNotify`)؛ الواجهة `ShopApp.tsx Outbox` و`CartView.send` (NETWORK ← حفظ بنفس المفتاح).
- صادر أندرويد: `OrderRepository.flush(onSent, onRejected)` + `OutboxWorker` + `data/Notifier.kt` (قناة orders) + `Components.AskNotifyWhen`.
- التنقل للتفاصيل ويب: `AdminApp.tsx` (`Focus`, `go`, `Dashboard`) → `Orders/Products/Shops({focus})`، `Products.ProductPeek`، `ShopApp.ProductSheet`.
- أندرويد: `AdminScreens.KPIS/KpiDef` + `DashboardScreen(canOpen, go)` + `Focus` في `AdminOrders.kt` + `AdminMoreScreen(focus)` + `canOpenSection`.
- الخادم: فلتر `today` و`ready` و`productId/shopId` في `/dashboard/summary`؛ `purgeIdempotency` في `api/cron.ts` (01:00 UTC).

### قرارات
- D14: تذكرني يحفظ المعرّف فقط؛ بدون تذكر لا يُكتب أي رمز على القرص (ويب session persistence، أندرويد ذاكرة فقط)، والبيانات المحفوظة تُمسح عند فتح التطبيق بلا جلسة — لأن أجهزة المحلات في غزة غالباً مشتركة.
- D15: نسخة القراءة عامة في طبقة Api (لا كود لكل شاشة)، مفصولة بـ uid؛ مسارات `/auth/` و`/files/` لا تُحفظ.
- D16: الطلب المرفوض من الخادم بعد الحفظ لا يُحذف بصمت على الويب: يبقى «يحتاج مراجعة» مع «رجّعه للسلة».
- D17: كل رقم في اللوحة يفتح القائمة التي حُسب منها، واختبار الخادم يتحقق أن العدد = طول القائمة.

### أخطاء محلولة
- «المتأخرة» في اللوحة ≠ قائمتها (القائمة شملت المغلقة) ← استبعاد المغلقة في `listOrders`.
- «قيد التجهيز» شمل ready_for_pickup بينما فلتره لا ← فصل مؤشر «جاهزة للتوصيل».

## v0.4.0 — التحديثات واللوحات
- مركز التحديث أندرويد: `update/UpdateChecker.kt` (GitHub latest + size + digest)، `ApkDownloader.kt` (Range استئناف + SHA-256 + rename ذرّي)، `UpdateFiles.kt` (filesDir/updates، cleanup)، `UpdateManager.kt` (UpdatePhase، download/pause/cancel/install، prefs، فحص دوري)، `UpdateWorkers.kt` (تنزيل كخدمة مقدّمة dataSync + فحص 12 ساعة)، `UpdateNotifications.kt` (قناتان، زر «ثبّت الآن»)، `ReleaseNotes.kt`.
- الواجهة: `ui/update/UpdateScreens.kt` (UpdateBanner، UpdateCenter، UpdateEntry، LocalOpenUpdates) + `UpdateViewModel`؛ الإشعار يفتح المركز عبر `MainActivity` (ACTION_OPEN/ACTION_INSTALL).
- تحديث الويب: `web/src/ui/UpdateToast.tsx` (sw.js?v=build، فحص version.json عند العودة وكل 30 د، SKIP_WAITING بموافقة)، `public/sw.js` (الصفحة شبكة أولاً)، `vite.config.ts` يكتب version.json بالملاحظات، `public/_headers`.
- اللوحات: الخادم `api/me.ts` (`GET /me/summary` للمحل والمندوب)؛ الويب `ui/Desk.tsx` (Hero, Tile, Spark, Ring, Donut, Row) في `AdminApp.Dashboard` و`ShopApp.ShopDesk` و`AgentApp`؛ أندرويد `ui/common/Desk.kt` + `MeViewModel` + `ui/shop/ShopDesk.kt` + `AdminScreens.DashboardScreen` + `AgentScreens`.

### قرارات
- D18: التحديث لا يُفرض أبداً: يُنزّل بالخلفية ويُتحقق منه، والمستخدم يختار وقت التثبيت (أندرويد) أو التحديث (ويب).
- D19: مجلد التحديث في filesDir الخاص (لا أذونات، يُحذف مع التطبيق)، والتنزيل التلقائي على Wi‑Fi فقط افتراضياً لتوفير باقات غزة.
- D20: ملخص الدور من خادم واحد `/me/summary` ويُحفظ للعمل بلا نت كباقي القراءات.

### أخطاء محلولة
- الموقع قد يعلق على إصدار قديم: sw.js كان ثابت المحتوى ويخدم `/` من الكاش أولاً ← الصفحة شبكة أولاً، والعامل بإصدار البناء، و`_headers` بلا تخزين لـ sw.js وversion.json.


## v0.4.1 — المنتجات منشورة وصور حقيقية
- `worker/scripts/prod-app.ts` (تشغيل كود الخادم ضد الإنتاج بصلاحيات المالك)، `publish-all.ts` (نشر كل المسودات)، `replace-images.ts` (رفع WebP وربطه بالمنتج).
- `catalog/fetch_photos.py` + `photo_queries*.py` + `cutout_photos.py` + `sheet.py`؛ الاختيارات `photo_choices.json` والإسناد `photo_credits.json` → `web/public/credits.json` + `credits.html`، سطر «الصورة:» في تفاصيل المنتج، ورابط في مركز التحديث بأندرويد.
- لوحة المعلومات رجعت مربعات بسيطة في مجموعات (الطلبات، المال، المحلات والمنتجات) قابلة للنقر، بطلب ساجد (بلا حلقة/رسم/قوائم).

### قرارات
- D21: صور المنتجات حقيقية من مصادر حرة مع إسناد إلزامي؛ لا صور مصممة. التفريغ الآلي يُراجع بصرياً، والعبوات المقصوصة أصلاً تُعرض كاملة بزوايا دائرية لأن التفريغ يتلفها.
- D22: لوحة الإدارة بسيطة (عنوان + رقم) بلا رسوم، بطلب صريح من ساجد.

### أخطاء محلولة
- ويكيميديا تحدّ المعدّل بشدة (429) وتخنق أحجام المصغّرات غير القياسية ← خيط واحد/اثنان، احترام Retry-After، وحجم 960 القياسي.
- rembg يمسح أجزاء من صور العبوات المقصوصة على حدودها ← وضع «full».
- BiRefNet يتجاوز ذاكرة البيئة (Killed) ← isnet-general-use.


## v0.5.0 — الإشعارات، التحقق بخطوتين، الأمان، الاستعادة
- الإشعارات: الخادم `api/notify.ts` (صندوق + مهام + FCM) كان جاهزاً. الويب `ui/Bell.tsx` + `lib/push.ts` (FCM بمفتاح VAPID الافتراضي لـFirebase، تسجيل/إلغاء الجهاز) + `public/sw.js` (push، notificationclick، `/?open=kind:id`). أندرويد `data/Inbox.kt` (InboxRepository، InboxPollWorker كل 15 د) + `ui/inbox/Inbox.kt` (BellButton، InboxSheet) + `Notifier.show(refKind, refId)` + `MainActivity` ACTION_OPEN_REF.
- التحقق بخطوتين: `domain/totp.ts` (RFC 6238، ±خطوة، منع إعادة الاستخدام)، `api/mfa.ts` (setup/enable/disable، السر مشفّر AES-GCM بمفتاح HKDF من BACKUP_KEY في `mfa/{uid}`، تذاكر `mfaTickets` 5 د/5 محاولات)، `auth.ts` (`/auth/login` يرجع `mfaRequired+ticket`، `/auth/login/mfa`)؛ الويب `Login.tsx` + `ui/Security.tsx` (QR بـqrcode-generator)؛ أندرويد `AuthRepository.login→ticket`/`loginMfa` + `AuthScreens` + `ui/common/SecurityScreen.kt`.
- الأمان: ترويسات الخادم في `api/app.ts`، CSP وHSTS في `web/public/_headers`، override لـ@grpc/grpc-js.
- الجدولة: `api/cron.ts` يعزل كل مهمة ويكتب `systemHealth/cron`.
- الفهارس: `firebase/firestore.indexes.json` (28)، `worker/scripts/deploy-indexes.ts`، `scripts/probe-indexes.ts` (فحص حي لـ32 نمطاً)، `test/indexes.test.ts`.
- الاستعادة: `worker/scripts/restore-drill.ts` (تنزيل من R2، بصمة، فك تشفير، مقارنة بالإنتاج).

### قرارات
- D23: إشعارات أندرويد بفحص دوري (WorkManager 15 د + كل دقيقة والتطبيق مفتوح) بدل حزمة Firebase، اتساقاً مع D12.
- D24: التحقق بخطوتين اختياري لكل حساب ومتاح لكل الأدوار؛ أسرار mfa خارج النسخ الاحتياطي (يُعاد تفعيلها بعد استعادة كارثية).
- D25: كل استعلام مركّب يجب أن يكون في firestore.indexes.json ومُختبراً بـprobe-indexes قبل النشر.

### أخطاء محلولة (حرجة)
- النسخ الاحتياطي والإشعارات وفحص التأخير لم تعمل في الإنتاج منذ الإطلاق: أول مهمة مجدولة (الإشعارات) كانت تفشل كل دقيقة بفهرس مركّب ناقص، والمهام متسلسلة فتوقفت البقية. وُجد 11 فهرساً ناقصاً (لوحة التوصيل، المتأخرة، طلبات المندوب، الدعم، فلترة المستخدمين، المسودات). الحل: الفهارس + عزل المهام + سجل صحة + فحص حي.
- رسالة خطأ Firestore كانت فارغة لأن runQuery يعيد الخطأ داخل مصفوفة.
