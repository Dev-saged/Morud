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

## M2 أساس الخادم — مغلقة
- 97 اختباراً (vitest)، تغطية أسطر 99.9%، `npm run check` يشمل typecheck والتحزيم.

## M3 قواعد Firestore — مغلقة
- 13 اختباراً على المحاكي، CI `firebase.yml`.

## M4 إدارة النظام — مغلقة
- 117 اختباراً، تغطية أسطر 99%.

## الخطوة التالية بالضبط
M5 — الطلبات والإشعارات (`worker/src/api/orders.ts`، `worker/src/api/notify.ts`، `worker/src/infra/fcm.ts`):
1. POST /orders (shop.orders.submit أو مسودة shop.orders.draft): المحل من claims/وثيقة المستخدم لا من الجسم، فحص حالة المحل، priceCart + detectPriceChange، creditCheck، ترقيم counters/orders، SLA تقديري، idempotent، إشعار الإدارة.
2. POST /orders/:id/transition: checkTransition + guards محسوبة + effects (فاتورة عند التأكيد تُنجز في M7؛ هنا سجل الحالة وتعيين الموظف).
3. طلبات التعديل والموافقة (changes) بنسخة سابقة.
4. GET قوائم الطلبات للإدارة بالفلاتر الثمانية وللمحل.
5. الإشعارات: صندوق داخلي + notificationJobs + FCM HTTP v1، إزالة الرموز التالفة، dedupe، إعادة المحاولة؛ تسجيل الأجهزة POST /devices.
