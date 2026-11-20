"""مولّد رموز مورد الثلاثة بألوان قابلة للتبديل + الشعار الأفقي بكلمات محوّلة لمسارات."""
import math
from textpath import text_path

# ===== ١) خاتم مورد =====
_pts = []
for k in range(8):
    a = math.radians(45 * k)
    _pts.append((104 * math.cos(a), 104 * math.sin(a)))
    a2 = math.radians(45 * k + 22.5)
    _pts.append((79.6 * math.cos(a2), 79.6 * math.sin(a2)))
STAR = " ".join(f"{128 + u:.2f},{128 - v:.2f}" for u, v in _pts)


def _ring(cx, cy, R, r):
    return (f"M{cx} {cy - R}A{R} {R} 0 1 1 {cx} {cy + R}A{R} {R} 0 1 1 {cx} {cy - R}Z"
            f"M{cx} {cy - r}A{r} {r} 0 1 1 {cx} {cy + r}A{r} {r} 0 1 1 {cx} {cy - r}Z")


def khatam(star="#0B5D4B", coin="#D4AF5A", meem="#0B5D4B"):
    return (f'<polygon fill="{star}" points="{STAR}"/><circle cx="128" cy="128" r="62" fill="{coin}"/>'
            f'<path fill="none" stroke="{meem}" stroke-width="20" stroke-linecap="round" d="M124 126C120 152 110 168 92 180"/>'
            f'<path fill="{meem}" fill-rule="evenodd" d="{_ring(143, 110, 30, 11)}"/>')


# ===== ٢) البوابة =====
ARCH = "M44 236V118C44 72 84 40 128 20C172 40 212 72 212 118V236Z"
ARCH_IN = "M62 220V122C62 84 94 58 128 41C162 58 194 84 194 122V220Z"
_MEEM, _ = text_path("م", "aref-ruqaa-ink-arabic-700-normal.woff2", 112, 124, 202, 'middle')


def bawaba(arch="#13294B", line="#C9A24A", meem="#E6C77A"):
    return (f'<path fill="{arch}" d="{ARCH}"/><path fill="none" stroke="{line}" stroke-width="6" d="{ARCH_IN}"/>'
            f'<path fill="{meem}" d="{_MEEM}"/>')


# ===== ٣) M بالنقطة =====
_M = ('<rect x="45" y="64" width="30" height="132"/><rect x="181" y="64" width="30" height="82"/>'
      '<polygon points="71.2,54 139.2,130 116.8,150 48.8,74"/><polygon points="139.2,150 207.2,74 184.8,54 116.8,130"/>'
      '<circle cx="60" cy="64" r="15"/><circle cx="128" cy="140" r="15"/><circle cx="196" cy="64" r="15"/>'
      '<circle cx="60" cy="196" r="15"/><circle cx="196" cy="146" r="15"/>')


def mdot(m="#1D4ED8", dot="#F08A24"):
    return f'<g fill="{m}">{_M}</g><circle cx="196" cy="198" r="19" fill="{dot}"/>'


def symbol_svg(inner, extra=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" {extra}>{inner}</svg>'


_WORD_CACHE = {}


def _word(font, h):
    key = (font, h)
    if key not in _WORD_CACHE:
        wd, ww = text_path("مورد", font, h, 610, 176, 'end')
        ld, lw = text_path("MAWRED", "alexandria-latin-600-normal.woff2", 26, 610, 226, 'end', tracking=420)
        _WORD_CACHE[key] = (wd, ww, ld, lw)
    return _WORD_CACHE[key]


WORD_FONT = {
    'khatam': ("el-messiri-arabic-700-normal.woff2", 112),
    'bawaba': ("amiri-arabic-700-normal.woff2", 120),
    'mdot': ("alexandria-arabic-800-normal.woff2", 98),
}


def lockup_svg(kind, sym_inner, ar, lat, extra=''):
    wd, ww, ld, lw = _word(*WORD_FONT[kind])
    x0 = 610 - max(ww, lw) - 24
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.0f} 0 {904 - x0:.0f} 256" {extra}>'
            f'<g transform="translate(640 0)">{sym_inner}</g><path fill="{ar}" d="{wd}"/><path fill="{lat}" d="{ld}"/></svg>')
