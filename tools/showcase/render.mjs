// يركّب صور README من لقطات التطبيق: انسخ اللقطات (web/e2e/showcase.spec.ts + لقطات أندرويد) وملفات الشعار إلى مجلد عمل ثم: node render.mjs <مجلد العمل>
import { chromium } from 'playwright';
import { cpSync } from 'node:fs';
const work = process.argv[2] ?? '/tmp/compose';
cpSync(new URL('.', import.meta.url).pathname, work, { recursive: true });
const jobs = [
  ['hero', 'hero.html', 1600],
  ['shop', 'row.html?theme=paper&eb=' + encodeURIComponent('واجهة المحل') + '&t=' + encodeURIComponent('صاحب المحل يطلب في دقيقة') + '&s=' + encodeURIComponent('عروض حية، طلب سريع بالكتابة، سلة يسعّرها الخادم، وتتبع لحظي حتى باب المحل') + '&items=' + encodeURIComponent('shop-promo|العروض والخصومات,shop-cart|السلة والخصم,shop-track|تتبع الطلب لحظة بلحظة,shop-orders|سجل الطلبات'), 1600],
  ['admin', 'row.html?theme=navy&kind=desk&w=700&eb=' + encodeURIComponent('لوحة الإدارة') + '&t=' + encodeURIComponent('المورد يدير كل شيء من شاشة واحدة') + '&s=' + encodeURIComponent('الطلبات والمستخدمون والصلاحيات والتقارير وسجل كامل لكل عملية') + '&items=' + encodeURIComponent('admin-orders|الطلبات بفلاتر المراحل,admin-team|المستخدمون والأدوار,admin-reports|تقارير تُصدَّر إلى Excel,admin-audit|سجل العمليات: من فعل ماذا ومتى'), 1600],
  ['android', 'row.html?theme=paper&kind=droid&w=262&eb=' + encodeURIComponent('أندرويد أصيل · Kotlin + Compose') + '&t=' + encodeURIComponent('تطبيق حقيقي لا غلاف لموقع') + '&s=' + encodeURIComponent('يفتح فوراً من الذاكرة، يعمل بلا نت، ويحدّث نفسه من GitHub') + '&items=' + encodeURIComponent('android-dashboard|لوحة الإدارة,android-users|الفريق,android-role-edit|محرر الأدوار,android-help|دليل الاستخدام,android-support|الدعم الفني'), 1600],
  ['more', 'row.html?theme=navy&w=280&eb=' + encodeURIComponent('لكل دور واجهته') + '&t=' + encodeURIComponent('المندوب والإدارة والمساعدة في جيبك') + '&s=' + encodeURIComponent('كل مستخدم يرى ما يخصه فقط، والصلاحيات تُفرض على الخادم') + '&items=' + encodeURIComponent('agent-tasks|مهام المندوب,admin-mobile|الإدارة من الجوال,shop-help|دليل داخل التطبيق,shop-support|تواصل مع الدعم'), 1600],
];
const b = await chromium.launch();
const p = await b.newPage({ deviceScaleFactor: 1.5, viewport: { width: 1600, height: 900 } });
for (const [name, url, w] of jobs) {
  await p.goto(`file://${work}/` + url);
  await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => i.onload = r))); });
  await p.waitForTimeout(400);
  await p.locator('.canvas').screenshot({ path: `${work}/out-${name}.png` });
  console.log(name);
}
await b.close();
