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

## الخطوة التالية بالضبط
M3 — `firebase/firestore.rules` + `firestore.indexes.json` + اختبارات بمحاكي Firestore (`@firebase/rules-unit-testing`):
- كل كتابة من العميل ممنوعة. القراءة: عضو المحل لمحله (claims.sh)، `sa` لكل طلبات المحل وإلا createdBy، المندوب للطلبات المسندة (agentId == uid)، الموظف حسب rp.
- الحالات السالبة من SRS 19.2 كلها.
