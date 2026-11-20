// اختبارات حزمة الشعار: الملفات موجودة، الألوان مطابقة للرموز، أيقونة أندرويد صالحة
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const brand = JSON.parse(read('spec/brand.json'));
const FINAL = 'brand/logo/final/';

test('كل ملفات التسليم موجودة', () => {
  const files = [
    'svg/mawred-symbol.svg', 'svg/mawred-symbol-small.svg', 'svg/mawred-symbol-reversed.svg', 'svg/mawred-symbol-black.svg',
    'svg/mawred-symbol-white.svg', 'svg/mawred-horizontal.svg', 'svg/mawred-horizontal-reversed.svg', 'svg/mawred-stacked.svg',
    'svg/mawred-wordmark.svg', 'svg/mawred-app-icon.svg', 'svg/mawred-favicon.svg', 'svg/mawred-maskable.svg',
    'web/favicon.ico', 'web/favicon.svg', 'web/apple-touch-icon.png', 'web/icon-192.png', 'web/icon-512.png', 'web/maskable-512.png',
    'web/site.webmanifest', 'android/drawable/ic_launcher_foreground.xml', 'android/drawable/ic_launcher_monochrome.xml',
    'android/mipmap-anydpi-v26/ic_launcher.xml', 'android/values/ic_launcher_background.xml'];
  for (const f of files) assert.ok(existsSync(new URL(FINAL + f, root)), f);
});

test('ملفات SVG بلا نص حي ولا صور نقطية ولا stroke', () => {
  for (const f of ['mawred-symbol', 'mawred-symbol-small', 'mawred-horizontal', 'mawred-stacked', 'mawred-wordmark']) {
    const s = read(`${FINAL}svg/${f}.svg`);
    assert.ok(!/<text|<image|stroke=/.test(s), f);
  }
});

test('الألوان في الشعار من لوحة الهوية فقط', () => {
  const allowed = new Set(Object.values(brand.colors).map((c) => c.hex.toUpperCase()).concat(['#000', '#000000', '#FFFFFF']));
  for (const f of ['mawred-symbol', 'mawred-horizontal', 'mawred-app-icon', 'mawred-horizontal-reversed']) {
    for (const [, c] of read(`${FINAL}svg/${f}.svg`).matchAll(/fill="(#[0-9A-Fa-f]{3,6})"/g)) assert.ok(allowed.has(c.toUpperCase()), `${f}: ${c}`);
  }
});

test('أيقونة أندرويد: أعلام الأقواس 0/1 ولون الخلفية أزرق مورد', () => {
  const x = read(`${FINAL}android/drawable/ic_launcher_foreground.xml`);
  for (const [, d] of x.matchAll(/pathData="([^"]+)"/g)) {
    const t = d.trim().split(/\s+/);
    t.forEach((tok, i) => {
      if (tok === 'A') for (const k of [4, 5]) assert.match(t[i + k], /^[01]$/, `علم قوس غير صالح: ${t[i + k]}`);
    });
  }
  assert.ok(read(`${FINAL}android/values/ic_launcher_background.xml`).includes(brand.colors.blue.hex));
  assert.ok(read(`${FINAL}android/mipmap-anydpi-v26/ic_launcher.xml`).includes('monochrome'));
});

test('مانيفست PWA عربي RTL بلون الهوية', () => {
  const m = JSON.parse(read(`${FINAL}web/site.webmanifest`));
  assert.equal(m.dir, 'rtl');
  assert.equal(m.theme_color, brand.colors.blue.hex);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});

test('تباين الأزرق مع الأبيض ≥ 4.5', () => {
  assert.ok(brand.contrast.blue_on_white >= 4.5 && brand.contrast.navy_on_paper >= 4.5);
});
