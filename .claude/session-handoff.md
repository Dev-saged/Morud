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

## M5 الطلبات والإشعارات — مغلقة
- 136 اختباراً للخادم + 13 للقواعد.

## الخطوة التالية بالضبط
M6 — التوصيل والمهلة (`worker/src/api/delivery.ts`):
1. POST /orders/:id/assign-agent (delivery.assign) + ترتيب التوصيل + GET /delivery/board بحسب المنطقة والمتأخر.
2. GET /agent/tasks (المندوب: المسند إليه فقط).
3. POST /orders/:id/track (المندوب أثناء on_the_way فقط، آخر 200 نقطة).
4. رفع صورة الإثبات والتوقيع إلى R2 (`proofs/`) بروابط خاصة.
5. Cron كل 5 دقائق: وسم المتأخر، تنبيه مسؤول الطلبات والمحل، تحديث الموعد.
6. PATCH /orders/:id/due (موعد مؤكد يدوياً).
