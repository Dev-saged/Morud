// عُدّة اللوحات لكل الأدوار: ترحيب، بطاقات قابلة للنقر، حلقات وتوزيع وخط اتجاه — SVG بلا مكتبات
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icons';

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'مساء الخير' : h < 12 ? 'صباح الخير' : h < 17 ? 'نهارك سعيد' : 'مساء الخير';
}
const DATE = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });

/** رأس اللوحة: تحية باسم المستخدم وتاريخ اليوم، وخلفية حيّة هادئة. */
export function Hero({ name, title, place, children, tone = 'primary' }: { name: string; title?: string; place?: string; children?: ReactNode; tone?: 'primary' | 'ink' }) {
  return (
    <header className={`hero hero-${tone}`}>
      <div className="hero-glow" aria-hidden="true" />
      <p className="hero-date">{place ? <><b>{place}</b> · </> : null}{DATE.format(new Date())}</p>
      <h1>{greeting()}، {name.split(' ')[0]}</h1>
      {title && <p className="hero-sub">{title}</p>}
      {children}
    </header>
  );
}

export type Tone = 'primary' | 'accent' | 'ok' | 'danger' | 'mute';

/** بطاقة مؤشر: أيقونة في مربع ملوّن، القيمة، تلميح، وخط اتجاه اختياري. زر حين تفتح تفاصيل. */
export function Tile({ icon, label, value, hint, tone = 'primary', spark, onClick, wide, alert }: { icon: IconName; label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; spark?: number[]; onClick?: () => void; wide?: boolean; alert?: boolean }) {
  const body = <>
    <span className={`tile-ico t-${tone}`}><Icon name={icon} size={20} /></span>
    <span className="tile-text"><small>{label}</small><b className="num">{value}</b>{hint && <em>{hint}</em>}</span>
    {spark && <Spark values={spark} />}
    {onClick && <Icon name="chevron" size={14} flip className="tile-go" />}
  </>;
  const cls = `tile${wide ? ' wide' : ''}${alert ? ' alert' : ''}${onClick ? ' tap' : ''}`;
  return onClick ? <button className={cls} onClick={onClick} aria-label={`${label}: ${typeof value === 'string' || typeof value === 'number' ? value : ''} — التفاصيل`}>{body}</button> : <div className={cls}>{body}</div>;
}

/** خط اتجاه بمساحة متدرجة. */
export function Spark({ values, labels }: { values: number[]; labels?: string[] }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * 100, 30 - (v / max) * 26] as const);
  const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <span className="spark-wrap">
      <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
        <polygon points={`0,32 ${line} 100,32`} fill="url(#sg)" />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      {labels && <span className="spark-labels">{labels.map((l, i) => <i key={i}>{l}</i>)}</span>}
    </span>
  );
}

/** حلقة نسبة (الحد الائتماني المتاح، تقدّم الطلب). */
export function Ring({ value, size = 64, label, tone = 'primary' }: { value: number; size?: number; label?: ReactNode; tone?: Tone }) {
  const r = 26, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <span className={`ring t-${tone}`} style={{ width: size, height: size }} role="img" aria-label={`${Math.round(v * 100)}٪`}>
      <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r={r} className="ring-bg" /><circle cx="32" cy="32" r={r} className="ring-fg" strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 32 32)" /></svg>
      {label !== undefined && <span className="ring-label num">{label}</span>}
    </span>
  );
}

/** توزيع حلقي لمراحل الطلبات، كل شريحة قابلة للنقر. */
export function Donut({ parts, onPick, center }: { parts: Array<{ key: string; label: string; value: number; tone: Tone }>; onPick?: (key: string) => void; center?: ReactNode }) {
  const sum = parts.reduce((a, p) => a + p.value, 0);
  const r = 40, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 100 100" role="img" aria-label="توزيع الطلبات المفتوحة">
        <circle cx="50" cy="50" r={r} className="ring-bg" strokeWidth="12" fill="none" />
        {sum > 0 && parts.filter((p) => p.value > 0).map((p) => {
          const len = (p.value / sum) * c;
          const el = <circle key={p.key} cx="50" cy="50" r={r} fill="none" strokeWidth="12" className={`seg t-${p.tone}`} strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`} strokeDashoffset={-off} transform="rotate(-90 50 50)" />;
          off += len;
          return el;
        })}
      </svg>
      <div className="donut-center">{center ?? <><b className="num">{sum}</b><small>مفتوح</small></>}</div>
      <ul className="legend">{parts.map((p) => <li key={p.key}>
        <button disabled={!onPick} onClick={() => onPick?.(p.key)}><i className={`dot t-${p.tone}`} />{p.label}<b className="num">{p.value}</b></button></li>)}</ul>
    </div>
  );
}

/** سطر قائمة غني: حرف أول في دائرة، عنوان وتفاصيل، شارة، ومبلغ. */
export function Row({ title, sub, chip, amount, onClick, initial }: { title: ReactNode; sub?: ReactNode; chip?: ReactNode; amount?: ReactNode; onClick?: () => void; initial?: string }) {
  const body = <>{initial !== undefined && <span className="avatar" aria-hidden="true">{initial.slice(0, 1)}</span>}<span className="row-main"><b>{title}</b>{sub && <small>{sub}</small>}</span>{chip}{amount !== undefined && <span className="num row-amt">{amount}</span>}</>;
  return onClick ? <button className="rich-row" onClick={onClick}>{body}</button> : <div className="rich-row">{body}</div>;
}

export function dayLabels(n = 7) {
  const f = new Intl.DateTimeFormat('ar-PS', { weekday: 'narrow' });
  return Array.from({ length: n }, (_, i) => f.format(new Date(Date.now() - (n - 1 - i) * 86_400_000)));
}
