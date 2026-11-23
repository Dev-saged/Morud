/**
 * الجداول العريضة (5 أعمدة فأكثر) تتحول على الجوال إلى بطاقات: كل خلية تحمل اسم عمودها،
 * فلا تنضغط الأسماء والأرقام في أعمدة ضيقة. يعمل تلقائياً على كل جدول يظهر في الصفحة.
 */
function label(t: HTMLTableElement) {
  const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
  if (heads.length < 5) return;
  t.classList.add('cards');
  for (const tr of t.querySelectorAll('tbody tr')) [...tr.children].forEach((td, i) => { const h = heads[i]; if (h && (td as HTMLElement).dataset.label !== h) (td as HTMLElement).dataset.label = h; });
}

export function autoCardTables(root: HTMLElement = document.body) {
  let queued = false;
  const run = () => { queued = false; root.querySelectorAll<HTMLTableElement>('table.table').forEach(label); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } }).observe(root, { childList: true, subtree: true });
  run();
}
