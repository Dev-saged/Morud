// يولّد متغيرات CSS من رموز التصميم المشتركة (مصدر واحد للويب وأندرويد)
import { readFileSync, writeFileSync } from 'node:fs';
const t = JSON.parse(readFileSync(new URL('../../spec/design-tokens.json', import.meta.url), 'utf8'));
const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const lines = [':root{color-scheme:light dark;'];
for (const [k, [l, d]] of Object.entries(t.color)) lines.push(`--${kebab(k)}:light-dark(${l},${d});`);
for (const [k, v] of Object.entries(t.type.scale)) lines.push(`--fs-${k}:${v};`);
t.space.forEach((v, i) => lines.push(`--s${i}:${v}px;`));
for (const [k, v] of Object.entries(t.radius)) lines.push(`--r-${k}:${v}px;`);
lines.push(`--ease-spring:${t.motion.spring};--ease-out:${t.motion.out};--t-fast:${t.motion.fast}ms;--t-base:${t.motion.base}ms;--t-slow:${t.motion.slow}ms;--touch:${t.touchTarget}px;`);
lines.push(`--font-display:'${t.type.display}','${t.type.body}',system-ui,sans-serif;--font-body:'${t.type.body}','${t.type.latin}',system-ui,sans-serif;}`);
writeFileSync(new URL('../src/tokens.css', import.meta.url), lines.join('\n') + '\n');
console.log('tokens.css');
