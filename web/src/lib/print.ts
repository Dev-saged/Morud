import type { Api } from './api';

/**
 * فتح فاتورة أو كشف للطباعة. النافذة تُفتح فوراً داخل نقرة المستخدم (وإلا يحجبها سفاري آيفون)،
 * ثم يُحمَّل فيها المستند؛ وعند الخطأ تظهر رسالته فيها بدل نافذة فارغة.
 */
export async function openPrintable(api: Api, path: string) {
  const w = window.open('', '_blank');
  if (w) w.document.write('<p dir="rtl" style="font-family:sans-serif;padding:24px">جارٍ تجهيز المستند…</p>');
  try {
    const html = await api.request<string>('GET', path, undefined, { raw: true });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    if (w) w.location.href = url;
    else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'تعذّر فتح المستند';
    if (w) { w.document.body.innerHTML = ''; const p = w.document.createElement('p'); p.dir = 'rtl'; p.style.cssText = 'font-family:sans-serif;padding:24px;color:#b42318'; p.textContent = msg; w.document.body.appendChild(p); }
  }
}
