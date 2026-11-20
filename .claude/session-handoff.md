# تسليم الجلسة — 2026-11-20

## الحالة
- الوحدة M0 (المواصفات والمعمارية) مغلقة: 18 اختبار اتساق spec خضراء محلياً و CI `spec.yml` مضاف.
- لا كود تطبيق بعد. المستودع monorepo؛ المجلدات `worker/` `firebase/` `android/` `web/` تُنشأ في وحداتها.

## القرارات
- Kotlin + Compose، Firebase + Cloudflare Workers + R2، React + TS للويب (تفاصيل D1–D10 في architecture.md).

## M9a الشعار — مغلقة
- معتمد: «M بالنقطة». الحزمة في `brand/logo/final/` (إعادة التوليد: `python3 brand/logo/final/kit.py` ثم `sheet.py`)، الرموز `spec/brand.json`، الدليل `brand/guidelines.md`.
- 24 اختباراً خضراء (`npm test`).

## M1 نواة المنطق — مغلقة
- `worker/src/domain/` 13 وحدة نقية، 58 اختباراً، تغطية أسطر 100%. CI `worker.yml`.

## الخطوة التالية بالضبط
M2 — أساس الـWorker (`worker/src/`):
1. `infra/firestore.ts`: عميل Firestore REST (get/query/commit/beginTransaction) بتوقيع JWT لحساب الخدمة عبر WebCrypto.
2. `infra/auth.ts`: تحقق Firebase ID token (مفاتيح Google العامة، aud/iss/exp/auth_time مقابل sessionsRevokedAt) + custom token.
3. `api/auth.ts`: POST /auth/login (معرّف ← بريد الدخول، حد المحاولات في KV، Identity Toolkit، فحص الحالة/الانتهاء) و/auth/logout و/auth/me.
4. `api/middleware.ts`: سياق المستخدم (وثيقته + الصلاحيات الفعلية + المحلات) لكل طلب، RBAC، تدقيق، idempotency بمعاملة Firestore (create-if-absent)، نموذج أخطاء JSON موحد، CORS.
5. اختبارات بـvitest مع محاكاة fetch لـGoogle APIs.
