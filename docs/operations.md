# دليل التشغيل والنشر والصيانة — مورد

> يغطي بنود التسليم في SRS 20: 19 (تشغيل الخادم)، 20 (نشر الويب)، 21 (إعداد أندرويد)، 22 (إنشاء الحسابات)، 23 (النسخ والاستعادة)، 30 (التحديثات المستقبلية).
> قاعدة ثابتة: لا كلمة مرور ولا مفتاح حقيقي داخل المستودع. الأسرار في GitHub Secrets أو `wrangler secret` أو مجلد خاص خارج المستودع فقط.

## 0. الصورة الكاملة

```
محل/مندوب/إدارة ── أندرويد (Kotlin/Compose) ─┐
                └─ ويب PWA (React) ──────────┼──► Cloudflare Worker (TypeScript) ──► Firestore (البيانات)
                                              │        │  KV: كاش الكتالوج، حدود المحاولات، رمز Google
                Firebase Auth (الهوية فقط) ◄──┘        │  R2: صور المنتجات + النسخ المشفرة
                                                       └─ FCM: الإشعارات الفورية · Cron كل دقيقة
```

| المكوّن | المكان | ملاحظات |
|---|---|---|
| الخادم | Cloudflare Workers، الإعداد `worker/wrangler.deploy.toml` | `[placement] mode="smart"` قرب Firestore |
| قاعدة البيانات | Firestore، الفهارس `firebase/firestore.indexes.json` | قواعد الأمان تمنع أي كتابة من العميل |
| الويب | Cloudflare Pages، المجلد `web/dist` | PWA قابل للتثبيت على آيفون وأندرويد |
| أندرويد | GitHub Actions يبني ويوقّع وينشر Release | التطبيق يحدّث نفسه من آخر Release |

## 1. الأسرار والمتغيرات (مرة واحدة)

| الاسم | أين | ما هو |
|---|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub Secrets | نشر الخادم والويب |
| `FIREBASE_SERVICE_ACCOUNT` | GitHub Secrets + `wrangler secret put SERVICE_ACCOUNT_JSON` | حساب خدمة Firebase (JSON) |
| `BACKUP_KEY` | GitHub Secrets + `wrangler secret put BACKUP_KEY` | مفتاح AES-256 للنسخ (Base64 لـ32 بايت). **احفظ نسخة منه خارج GitHub؛ بدونه لا تُفك أي نسخة** |
| `OWNER_PASSWORD` | GitHub Secrets | كلمة مرور المالك عند التهيئة الأولى فقط |
| `KEYSTORE_BASE64`, `SIGNING_STORE_PASSWORD`, `SIGNING_KEY_ALIAS`, `SIGNING_KEY_PASSWORD` | GitHub Secrets | توقيع APK |
| `MAWRED_FIREBASE_PROJECT_ID`, `MAWRED_FIREBASE_API_KEY`, `MAWRED_API_URL`, `MAWRED_WEB_ORIGIN`, `OWNER_USERNAME`, `OWNER_NAME` | GitHub Variables | إعداد عام غير سري |

مفتاح Firebase للويب (`VITE_FIREBASE_*` في `web/.env.production`) **عام بطبيعته** ويظهر لأي متصفح؛ الحماية في الخادم وقواعد Firestore لا في إخفائه.

## 2. تشغيل الخادم ونشره (بند 19)

**من الجوال:** GitHub ← Actions ← `deploy` ← Run workflow ← `target: server` (أو `all`).
يشغّل الاختبارات أولاً، ثم ينشر الفهارس والقواعد والخادم. لا نشر بدون اختبارات خضراء.

**يدوياً:**
```bash
cd worker
npm ci && npx vitest run          # 216 اختباراً يجب أن تنجح
npx wrangler deploy -c wrangler.deploy.toml
npx tsx scripts/deploy-indexes.ts ../firebase/firestore.indexes.json
```

**التحقق بعد النشر:**
```bash
curl https://<worker-host>/health                 # {"ok":true,"service":"mawred-api"}
npx tsx scripts/health.ts                          # النسخة الأخيرة، مهام Cron، الإشعارات العالقة، الأجهزة
npx tsx scripts/probe-indexes.ts                   # كل استعلام حقيقي في الكود ينجح على الإنتاج
npx tsx scripts/latency.ts                         # زمن الاستجابة الفعلي
```
النصوص الإدارية تحتاج: `SERVICE_ACCOUNT=<مسار ملف JSON خارج المستودع> FIREBASE_API_KEY=… OWNER_UID=…` (و`CF_TOKEN`, `CF_ACCOUNT` لما يلمس R2).

**المراقبة اليومية:** مهام Cron تكتب نتيجتها في `systemHealth/cron`؛ أي فشل يُكتب فوراً، و`scripts/health.ts` يعرضه. سجلات الخادم: `npx wrangler tail -c wrangler.deploy.toml` وكل خطأ يحمل `requestId`.

**أعطال شائعة:**

| العَرَض | السبب والحل |
|---|---|
| `FAILED_PRECONDITION` / استعلام يفشل | فهرس ناقص ← أضفه في `firestore.indexes.json` ثم `deploy-indexes`، وأكد بـ`probe-indexes` |
| `AUTH_UNAVAILABLE` | Google/Firebase لا يستجيب ← يتعافى وحده؛ الرمز مخزن في KV ويُعاد طلبه |
| بطء مفاجئ في الكتالوج | نسخة KV قديمة ← أي تعديل منتج يرفع `catver` تلقائياً |
| `RATE_LIMITED` لحساب حقيقي | 5 محاولات خاطئة خلال 15 دقيقة ← ينتظر، أو تعيد الإدارة كلمة المرور |

## 3. نشر الويب (بند 20)

**من الجوال:** Actions ← `deploy` ← `target: web`.

**يدوياً:**
```bash
cd web
npm ci && npx vitest run && npx playwright test   # اختبارات الوحدات + المتصفحات الأربعة + الوصولية
npm run build
npx wrangler pages deploy dist --project-name mawred --branch main
```
- الأصول بأسماء مجزأة (hash) وتُخزَّن دائماً؛ `index.html` و`sw.js` بلا تخزين، فيصل التحديث فوراً.
- عامل الخدمة يحفظ الواجهة والكتالوج للعمل بلا نت، وطابور الطلبات يُرسل عند عودة الاتصال.
- لتغيير النطاق: `MAWRED_WEB_ORIGIN` + `ALLOWED_ORIGINS` في إعداد الخادم (CORS) ثم نشر الاثنين.

## 4. إعداد أندرويد (بند 21)

- المشروع `android/` (Kotlin + Jetpack Compose، minSdk 26، targetSdk 36)، مبني من قالب `Dev-saged/android-template`.
- **البناء الآلي:** كل push يمس `android/` أو `spec/` يشغّل `android.yml`: اختبارات ← APK موقّع ← Release باسم `v<الإصدار>-b<رقم البناء>` مع ملاحظات `docs/releases/v<الإصدار>.md`.
- **محلياً:** JDK 17 + Android SDK 36:
  ```bash
  cd android
  ./gradlew testDebugUnitTest      # 50 اختباراً
  ./gradlew assembleDebug          # يحتاج mawred.apiUrl و mawred.firebaseApiKey في ~/.gradle/gradle.properties
  ```
- **الهوية البصرية:** كل اسم ولون وخط ومفتاح في `BrandConfig.kt` ورموز التصميم مولّدة من `spec/design-tokens.json` (مصدر واحد مع الويب).
- **التحديث الذاتي:** التطبيق يقرأ آخر Release في المستودع، يقارن `versionCode`، ينزّل في مجلد التطبيق، يثبّت، ثم يحذف الملف.
- **مفتاح التوقيع:** احتفظ بنسخة من ملف keystore وكلماته خارج GitHub. فقدانه = لا يمكن تحديث التطبيق المثبت.

## 5. إنشاء الحسابات (بند 22)

1. **المالك (مرة واحدة):** Actions ← `deploy` ← `bootstrap: true`. ينشئ البيانات الأولية من `spec/seed.json` (التصنيفات، الوحدات، الإعدادات؛ الأدوار والصلاحيات تُقرأ من `spec/`) وحساب المالك من `OWNER_USERNAME`/`OWNER_PASSWORD`. التشغيل الثاني يرفض (`ALREADY_BOOTSTRAPPED`).
2. **موظف إدارة:** المالك ← المستخدمون والأدوار ← «مستخدم جديد» ← الاسم واسم المستخدم والدور ← تظهر كلمة مرور مؤقتة **مرة واحدة** ← يغيّرها الموظف إجبارياً في أول دخول.
3. **محل:** المحلات ← «محل جديد» ← بيانات المحل والعنوان والحد الائتماني وطرق الدفع ← يُنشأ حساب صاحب المحل بكلمة مؤقتة.
4. **موظفو المحل:** تفعّل الإدارة «إدارة الموظفين» للمحل، فيضيف صاحبه موظفيه بصلاحيات محددة (مسودات فقط مثلاً)، أو تضيفهم الإدارة مباشرة.
5. **مندوب:** مستخدم جديد بدور «مندوب توصيل»؛ يرى مهامه فقط.
6. **صلاحية استثنائية لشخص:** «تخصيص الصلاحيات» ← منح أو حجب صلاحية واحدة دون تغيير دوره.

كل إنشاء وتعديل وإيقاف يُسجَّل في سجل العمليات مع الفاعل والوقت.

## 6. النسخ الاحتياطي والاستعادة (بند 23)

**النسخ:** تلقائياً كل ليلة 01:00 UTC (03:00 بتوقيت غزة)، أو فوراً من قسم «النسخ الاحتياطي».
كل نسخة: كل المجموعات ← ضغط gzip ← تشفير AES-256-GCM بـ`BACKUP_KEY` ← R2 (`mawred-backups`) + سجل فيه البصمة SHA-256. الاحتفاظ حسب `backupRetentionDays` في الإعدادات (افتراضياً 30 يوماً).

**تمرين الاستعادة (آمن، يُنصح به شهرياً):**
```bash
cd worker
SERVICE_ACCOUNT=… CF_TOKEN=… CF_ACCOUNT=… BACKUP_KEY=… OWNER_UID=… FIREBASE_API_KEY=… npx tsx scripts/restore-drill.ts
```
ينزّل آخر نسخة، يتحقق من البصمة، يفك التشفير، يستعيدها في قاعدة معزولة بالذاكرة، ويقارن كل مجموعة بالإنتاج. آخر تمرين: مطابقة 100%.

**استعادة طوارئ إلى الإنتاج:**
```bash
# 1) تجربة بلا كتابة: تنزيل + بصمة + فك تشفير + عدّ السجلات
… npx tsx scripts/restore.ts
# 2) نسخة محددة بدل الأحدث
BACKUP=backups/2026-11-23-xxxxxxxx.mwb … npx tsx scripts/restore.ts
# 3) التنفيذ الفعلي
RESTORE_CONFIRM=نعم … npx tsx scripts/restore.ts
```
قبل أي كتابة يأخذ نسخة أمان من الوضع الحالي (`backups/pre-restore-…`) ويوقف العملية إن فشل حفظها أو اختلفت البصمة. الاستعادة تكتب سجلات النسخة فوق الحالية ولا تحذف ما أُضيف بعدها، وتُسجَّل في سجل العمليات. بعدها: `scripts/health.ts` ودخول تجريبي.

## 7. التحديثات المستقبلية (بند 30)

1. **قبل أي تغيير:** اقرأ `CLAUDE.md` و`.claude/session-handoff.md` و`docs/repo-map.md` (خريطة الميزة ← الملف ← الرمز، والقرارات وأسبابها).
2. **الفرع:** `feature/<الاسم>`. أي قاعدة عمل جديدة تبدأ من `spec/` (الحالات، الصلاحيات، الأدوار) لأن الخادم والويب وأندرويد يقرؤون منه.
3. **صلاحية جديدة:** أضفها في `spec/permissions.json` ثم للأدوار في `spec/roles.json`، وطبّقها بـ`requirePerm` في الخادم. فحص الواجهة شكلي فقط.
4. **مسار API جديد:** المعالج في `worker/src/api/`، التسجيل في `routes`، اختبار في `worker/test/`، وسطر في `docs/api.md`. الكتابة المالية: معاملة واحدة + `auditWrite` + مفتاح منع تكرار.
5. **حقل في قاعدة البيانات:** إضافة فقط (لا إعادة تسمية)، وقيمة افتراضية للسجلات القديمة عند القراءة، وتحديث `docs/data-model.md`. استعلام جديد ← فهرس + `probe-indexes`.
6. **الاختبارات قبل الدمج:** `npm test` (spec) · `worker: npx vitest run` · `web: npx vitest run && npx playwright test` · `android: ./gradlew testDebugUnitTest`. CI يعيدها كلها.
7. **الإصدار:** رفع `VERSION_NAME` في `android/gradle.properties` و`version.json`، وكتابة `docs/releases/vX.Y.Z.md` (الإضافات / المميزات / الإصلاحات)، ثم نشر الخادم والويب، وأندرويد يُنشر وحده.
8. **التراجع:** الويب ← إعادة نشر نسخة Pages سابقة من لوحة Cloudflare. الخادم ← `npx wrangler rollback`. البيانات ← لا تُحذف؛ صحّح بحركة عكسية.
