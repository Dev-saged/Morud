# تسليم الجلسة — 2026-11-20

## الحالة
- الوحدة M0 (المواصفات والمعمارية) مغلقة: 18 اختبار اتساق spec خضراء محلياً و CI `spec.yml` مضاف.
- لا كود تطبيق بعد. المستودع monorepo؛ المجلدات `worker/` `firebase/` `android/` `web/` تُنشأ في وحداتها.

## القرارات
- Kotlin + Compose، Firebase + Cloudflare Workers + R2، React + TS للويب (تفاصيل D1–D10 في architecture.md).

## الخطوة التالية بالضبط
M1 — نواة المنطق في `worker/src/domain` (TypeScript، اختبارات بـvitest أو node:test):
1. `money.ts`: أغورة int، `lineTotal(qtyMilli, unitPrice)` بتقريب half-up، تنسيق ILS.
2. `units.ts`: التحقق من الكمية (لا صفر/سالب، كسور حسب allowFraction، minQty/step).
3. `fsm.ts`: يقرأ `spec/order-states.json` ويعيد الانتقال المسموح أو سبب الرفض.
4. `sla.ts`: `computeDueAt` عبر ساعات العمل والعطل بتوقيت Asia/Gaza.
5. `ledger.ts`: رصيد، تخصيص دفعة للأقدم، رصيد دائن، عكس.
6. `pricing.ts` + `promotions.ts`: إعادة حساب السلة والعروض الخمسة بلا تكرار خصم.
7. `search.ts`: تطبيع عربي (همزات، تاء مربوطة، ألف مقصورة، تشكيل، أرقام).
شرط الإغلاق: سيناريوهات SRS 19.3 الخمسة + حالات حدية، تغطية ≥ 95%.

## أسئلة لساجد (غير معطِّلة)
- العطلة الأسبوعية الافتراضية.
