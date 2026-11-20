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

## M6 التوصيل والمهلة — مغلقة (141 اختباراً)

## الخطوة التالية بالضبط
M7 — المالية (`worker/src/api/finance.ts`):
1. POST /payments (payments.create، idempotent) عبر postPayment + إشعار المحل «تم تسجيل دفعة».
2. POST /payments/:id/reverse (payments.reverse، سبب) بحركة عكسية + إعادة فتح التخصيصات.
3. POST /ledger/adjustments (accounts.adjust) تسوية مدينة/دائنة بسبب.
4. GET /shops/:id/statement?from&to (accounts.view أو عضو بـshop.statement.view) عبر statement().
5. GET /invoices، /invoices/:id، /shops/:id/invoices؛ كشف وفاتورة HTML للطباعة/PDF.
6. Cron: الطلبات المسلّمة ذات الفواتير المسددة ← financially_completed (system).
7. سيناريوهات SRS 19.3 الخمسة على الخادم بالكامل.
