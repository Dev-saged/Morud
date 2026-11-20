# تسليم الجلسة — 2026-11-20

## الحالة
- الوحدة M0 (المواصفات والمعمارية) مغلقة: 18 اختبار اتساق spec خضراء محلياً و CI `spec.yml` مضاف.
- لا كود تطبيق بعد. المستودع monorepo؛ المجلدات `worker/` `firebase/` `android/` `web/` تُنشأ في وحداتها.

## القرارات
- Kotlin + Compose، Firebase + Cloudflare Workers + R2، React + TS للويب (تفاصيل D1–D10 في architecture.md).

## M9a الشعار — بانتظار اختيار ساجد
- المفاهيم v2 في `brand/logo/v2/`: 01 خاتم مورد (مُرشَّح)، 02 بوابة مورد، 03 M بالنقطة. لوحة العرض `mawred-logo-presentation.png` لصاحب المشروع ليختار.
- إعادة توليد اللوحة: `cd brand/logo/v2 && python3 build_board.py` ثم render_png.py على `board.html` (1600×8510).
- بعد الاختيار: تنقيح هندسي + نسخة صغيرة + ألوان (أزرق ثقة) + lockups أفقي/عمودي + `export_variants.py --web-icons` + أيقونة أندرويد adaptive + لوحة عرض + دليل استخدام، ثم M1.

## الخطوة التالية بعد الشعار
M1 — نواة المنطق في `worker/src/domain` (TypeScript، اختبارات بـvitest أو node:test):
1. `money.ts`: أغورة int، `lineTotal(qtyMilli, unitPrice)` بتقريب half-up، تنسيق ILS.
2. `units.ts`: التحقق من الكمية (لا صفر/سالب، كسور حسب allowFraction، minQty/step).
3. `fsm.ts`: يقرأ `spec/order-states.json` ويعيد الانتقال المسموح أو سبب الرفض.
4. `sla.ts`: `computeDueAt` عبر ساعات العمل والعطل بتوقيت Asia/Gaza.
5. `ledger.ts`: رصيد، تخصيص دفعة للأقدم، رصيد دائن، عكس.
6. `pricing.ts` + `promotions.ts`: إعادة حساب السلة والعروض الخمسة بلا تكرار خصم.
7. `search.ts`: تطبيع عربي (همزات، تاء مربوطة، ألف مقصورة، تشكيل، أرقام).
شرط الإغلاق: سيناريوهات SRS 19.3 الخمسة + حالات حدية، تغطية ≥ 95%.

## أسئلة لساجد
- أي مفهوم شعار يعتمد صاحب المشروع؟
