// تفريغ خلفية صورة المنتج في المتصفح: تعبئة من الحواف بلون الخلفية مع حافة ناعمة
export type Rgba = Uint8ClampedArray;

function dist(d: Rgba, i: number, r: number, g: number, b: number): number {
  return Math.abs(d[i]! - r) + Math.abs(d[i + 1]! - g) + Math.abs(d[i + 2]! - b);
}

/** هل الصورة مفرّغة أصلاً (زوايا شفافة)؟ */
export function hasTransparentEdges(d: Rgba, w: number, h: number): boolean {
  const corners = [0, w - 1, (h - 1) * w, h * w - 1];
  return corners.every((p) => d[p * 4 + 3]! < 16);
}

/** يزيل الخلفية المتصلة بالحواف ضمن تسامح لوني، ويُرجع عدد البكسلات المزالة. */
export function removeBackground(d: Rgba, w: number, h: number, tolerance = 60): number {
  const samples: number[] = [];
  for (let x = 0; x < w; x++) samples.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) samples.push(y * w, y * w + w - 1);
  let r = 0, g = 0, b = 0;
  for (const p of samples) { r += d[p * 4]!; g += d[p * 4 + 1]!; b += d[p * 4 + 2]!; }
  r /= samples.length; g /= samples.length; b /= samples.length;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const p of samples) if (!seen[p] && dist(d, p * 4, r, g, b) <= tolerance) { seen[p] = 1; stack.push(p); }
  let removed = 0;
  while (stack.length) {
    const p = stack.pop()!;
    d[p * 4 + 3] = 0;
    removed++;
    const x = p % w, y = (p - x) / w;
    const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const n of next) if (n >= 0 && !seen[n] && dist(d, n * 4, r, g, b) <= tolerance) { seen[n] = 1; stack.push(n); }
  }
  // حافة ناعمة: البكسل المعتم المجاور للخلفية يأخذ شفافية جزئية حسب قربه من لونها
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) continue;
    const x = p % w;
    const touches = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (p >= w && seen[p - w]) || (p < w * (h - 1) && seen[p + w]);
    if (touches) d[p * 4 + 3] = Math.min(d[p * 4 + 3]!, Math.round(255 * Math.min(1, dist(d, p * 4, r, g, b) / (tolerance * 2))));
  }
  return removed;
}

/** شعار «M بالنقطة» (مسار المربع 256) — نفس brand/logo/final. */
export const MARK_PATH = 'M43 59V191a15 15 0 0 0 30 0V100l42 47a15 15 0 0 0 22 0l42-47v41a15 15 0 0 0 30 0V59a15 15 0 0 0-26-10l-57 64-57-64a15 15 0 0 0-26 10z';
export const MARK_BLUE = '#1D4ED8';
export const MARK_ORANGE = '#F08A24';

/** مكان علامة مورد: مربع في الزاوية السفلية اليسرى بعرض 14% من الضلع الأقصر (حد أدنى 40px) وهامش 3%. */
export function markRect(w: number, h: number) {
  const size = Math.max(40, Math.round(Math.min(w, h) * 0.14));
  const pad = Math.round(Math.min(w, h) * 0.03);
  return { x: pad, y: h - size - pad, size };
}

/** يرسم علامة مورد: بلاطة بيضاء دائرية الحواف وفوقها الشعار الملوّن. */
export function stampMark(g: CanvasRenderingContext2D, w: number, h: number) {
  const { x, y, size } = markRect(w, h);
  g.save();
  g.globalAlpha = 0.92;
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.roundRect(x, y, size, size, size * 0.22);
  g.fill();
  g.globalAlpha = 1;
  g.translate(x + size * 0.12, y + size * 0.12);
  const k = (size * 0.76) / 256;
  g.scale(k, k);
  g.fillStyle = MARK_BLUE;
  g.fill(new Path2D(MARK_PATH));
  g.fillStyle = MARK_ORANGE;
  g.beginPath();
  g.arc(194, 193, 19, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** يحوّل ملف الصورة إلى PNG مفرّغ بعلامة مورد، بحد أقصى 1600px (متصفح فقط). */
export async function toCutoutPng(file: Blob, tolerance = 60): Promise<{ blob: Blob; removedRatio: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.max(64, Math.round(bmp.width * scale)), h = Math.max(64, Math.round(bmp.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const removed = hasTransparentEdges(img.data, w, h) ? 0 : removeBackground(img.data, w, h, tolerance);
  g.putImageData(img, 0, 0);
  stampMark(g, w, h);
  const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('تعذّر إنشاء الصورة'))), 'image/png'));
  return { blob, removedRatio: removed / (w * h) };
}
