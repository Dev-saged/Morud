# مورد MAWRED — منصة توريد بالجملة لمحلات غزة

## ابدأ هنا (كل جلسة)
اقرأ فقط: هذا الملف، `.claude/session-handoff.md`، `docs/repo-map.md`. لا مسح للمستودع.
المرجع الملزم: `docs/SRS.md` + الانحرافات المعتمدة في `docs/architecture.md`.

## المكدس (معتمد 2026-11-20)
- Android: Kotlin + Jetpack Compose من Dev-saged/android-template (لا Java).
- الخادم: Cloudflare Worker (TypeScript) + Firebase Auth + Firestore + R2 + KV + FCM. لا Spring Boot/PostgreSQL.
- الويب: React + TypeScript + Vite + PWA.

## قواعد غير قابلة للتفاوض
- وحدة واحدة في كل مرة حسب `docs/roadmap.md`؛ لا تبدأ التالية قبل اختبارات خضراء وتحديث repo-map والقائمة.
- لا كتابة من العميل إلى Firestore إطلاقاً؛ كل كتابة عبر Worker مع RBAC + تدقيق + idempotency.
- المال int بالأغورة، الكمية qtyMilli؛ لا float في أي مسار مالي. الخادم يعيد حساب كل إجمالي.
- الدفتر append-only؛ التصحيح بحركة عكسية.
- لا بيانات وهمية في الإنتاج، لا أزرار بلا وظيفة، لا أسرار في المستودع.
- لا تدّعِ أن شيئاً يعمل قبل تشغيل اختباراته فعلياً.
- commits بلا ذيول أدوات.

## الاختبارات
- spec: `npm test` (node:test بلا تبعيات).
