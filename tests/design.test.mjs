// تحقق تباين رموز التصميم (WCAG) بتحويل OKLCH إلى sRGB
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const t = JSON.parse(readFileSync(new URL('../spec/design-tokens.json', import.meta.url), 'utf8'));

function oklchToLinear(s) {
  const [, L, C, H] = /oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/.exec(s).map(Number);
  const l = L / 100, a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b, m_ = l - 0.1055613458 * a - 0.0638541728 * b, s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const [L3, M3, S3] = [l_ ** 3, m_ ** 3, s_ ** 3];
  return [4.0767416621 * L3 - 3.3077115913 * M3 + 0.2309699292 * S3, -1.2684380046 * L3 + 2.6097574011 * M3 - 0.3413193965 * S3, -0.0041960863 * L3 - 0.7034186147 * M3 + 1.707614701 * S3].map((v) => Math.min(1, Math.max(0, v)));
}
const lum = (s) => { const [r, g, b] = oklchToLinear(s); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const pairs = [['ink', 'surface'], ['ink', 'raised'], ['mute', 'surface'], ['mute', 'raised'], ['onPrimary', 'primary'], ['primary', 'surface'], ['accentInk', 'surface'], ['ok', 'surface'], ['danger', 'surface'], ['danger', 'raised'], ['ok', 'raised']];
for (const mode of [0, 1]) {
  for (const [fg, bg] of pairs) {
    test(`${mode ? 'داكن' : 'فاتح'}: ${fg} على ${bg} ≥ 4.5`, () => {
      const r = ratio(t.color[fg][mode], t.color[bg][mode]);
      assert.ok(r >= 4.5, `${fg}/${bg} = ${r.toFixed(2)}`);
    });
  }
}

test('ألوان الشعار مطابقة لرموز الهوية', () => {
  const brand = JSON.parse(readFileSync(new URL('../spec/brand.json', import.meta.url), 'utf8'));
  assert.equal(t.color.primary[0], brand.colors.blue.oklch);
  assert.equal(t.color.accent[0], brand.colors.orange.oklch);
});

test('كل نبرة حالة تشير إلى لون موجود، وكل حالة طلب لها نبرة', () => {
  const fsm = JSON.parse(readFileSync(new URL('../spec/order-states.json', import.meta.url), 'utf8'));
  for (const s of fsm.states) assert.ok(t.color[t.statusTone[s.tone]], s.id);
  assert.ok(t.touchTarget >= 44);
});
