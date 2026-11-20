"""حزمة شعار مورد النهائية — «M بالنقطة». يولّد كل الملفات من هندسة واحدة."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'v2'))
from textpath import text_path  # noqa: E402

BLUE, ORANGE, NAVY, WHITE, PAPER = '#1D4ED8', '#F08A24', '#0B1533', '#FFFFFF', '#F7F5F0'

# الهندسة: خط بسماكة T ونهايات مدورة، مُزاحة للمركز البصري
T = 30


def _seg_poly(x1, y1, x2, y2, r):
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    nx, ny = -dy / L * r, dx / L * r
    return [(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)]


def m_parts(t=T, leg_end=146, dot_cy=198, dot_r=19, ox=-2, oy=-5):
    """أجزاء الحرف كمسارات مملوءة (بلا stroke): الساقان، القطران، المفاصل الدائرية، والنقطة."""
    r = t / 2
    pts = [(60, 196), (60, 64), (128, 140), (196, 64), (196, leg_end)]
    d = []
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        p = _seg_poly(x1 + ox, y1 + oy, x2 + ox, y2 + oy, r)
        d.append('M' + 'L'.join(f'{x:.2f} {y:.2f}' for x, y in p) + 'Z')
    for x, y in pts:
        d.append(_circle(x + ox, y + oy, r))
    dot = _circle(196 + ox, dot_cy + oy, dot_r)
    return ''.join(d), dot


def _circle(cx, cy, r):
    return f'M{cx - r:.2f} {cy:.2f}A{r} {r} 0 1 0 {cx + r:.2f} {cy:.2f}A{r} {r} 0 1 0 {cx - r:.2f} {cy:.2f}Z'


M_D, DOT_D = m_parts()
# نسخة المقاسات الصغيرة (≤ 32px): خط أسمك، ساق أقصر، نقطة أكبر — كي لا تلتصق النقطة بالساق
MS_D, DOTS_D = m_parts(t=40, leg_end=128, dot_cy=200, dot_r=24, ox=-2, oy=-6)


def symbol(m=BLUE, dot=ORANGE, small=False, bg=None, rx=56, scale=1.0):
    md, dd = (MS_D, DOTS_D) if small else (M_D, DOT_D)
    b = f'<rect width="256" height="256" rx="{rx}" fill="{bg}"/>' if bg else ''
    g = f'<g transform="translate({128 - 128 * scale:.2f} {128 - 128 * scale:.2f}) scale({scale})">' if scale != 1 else '<g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>مورد</title>{b}{g}'
            f'<path fill="{m}" d="{md}"/><path fill="{dot}" d="{dd}"/></g></svg>')


def _inner(svg):
    return svg[svg.index('<g'):svg.rindex('</svg>')]


AR_FONT = 'alexandria-arabic-800-normal.woff2'
WD, WW = text_path('مورد', AR_FONT, 98, 0, 0, 'start')
LD, LW = text_path('MAWRED', 'alexandria-latin-600-normal.woff2', 26, 0, 0, 'start', tracking=420)


def horizontal(m=BLUE, dot=ORANGE, ar=BLUE, lat=ORANGE):
    # الرمز يميناً (RTL)، الكلمة يساره بفاصل = نصف عرض الرمز البصري
    gap = 34
    sym_x = max(WW, LW) + gap
    w = sym_x + 214
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 40 {w - 30:.0f} 186"><title>مورد MAWRED</title>'
            f'<g transform="translate({sym_x - 41:.1f} 0)">{_inner(symbol(m, dot))}</g>'
            f'<g transform="translate({max(WW, LW) - WW:.1f} 170)"><path fill="{ar}" d="{WD}"/></g>'
            f'<g transform="translate({max(WW, LW) - LW:.1f} 214)"><path fill="{lat}" d="{LD}"/></g></svg>')


def stacked(m=BLUE, dot=ORANGE, ar=BLUE, lat=ORANGE):
    w = max(WW, LW, 200) + 20
    cx = w / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 30 {w:.0f} 380"><title>مورد MAWRED</title>'
            f'<g transform="translate({cx - 128:.1f} 0)">{_inner(symbol(m, dot))}</g>'
            f'<g transform="translate({cx - WW / 2:.1f} 340)"><path fill="{ar}" d="{WD}"/></g>'
            f'<g transform="translate({cx - LW / 2:.1f} 392)"><path fill="{lat}" d="{LD}"/></g></svg>')


def wordmark(ar=BLUE, lat=ORANGE):
    w = max(WW, LW)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 64 {w + 16:.0f} 164"><title>مورد MAWRED</title>'
            f'<g transform="translate({w - WW:.1f} 170)"><path fill="{ar}" d="{WD}"/></g>'
            f'<g transform="translate({w - LW:.1f} 214)"><path fill="{lat}" d="{LD}"/></g></svg>')


# ===== Android vector drawables (adaptive icon 108dp، المنطقة الآمنة 66dp) =====
def android_vector(fill_m, fill_dot):
    # 256 → 108dp: الشعار داخل المنطقة الآمنة 66dp
    s = 66 / 256 * 0.86
    off = (108 - 256 * s) / 2

    def tr(d):
        out, num = [], ''
        tokens = []
        for ch in d:
            if ch.isalpha():
                if num:
                    tokens.append(num)
                    num = ''
                tokens.append(ch)
            elif ch in ' ,':
                if num:
                    tokens.append(num)
                    num = ''
            else:
                if ch == '-' and num and num[-1] != 'e':
                    tokens.append(num)
                    num = ''
                num += ch
        if num:
            tokens.append(num)
        cmd, idx = None, 0
        for tkn in tokens:
            if tkn.isalpha():
                cmd, idx = tkn, 0
                out.append(tkn)
                continue
            v = float(tkn)
            if cmd == 'A':
                pos = idx % 7
                if pos in (0, 1):
                    v *= s
                elif pos == 5:
                    v = v * s + off
                elif pos == 6:
                    v = v * s + off
            else:
                v = v * s + off
            if cmd == 'A' and idx % 7 in (3, 4):
                out.append(str(int(v)))  # أعلام القوس 0/1 فقط
            else:
                out.append(f'{v:.3f}')
            idx += 1
        return ' '.join(out)

    paths = (f'<path android:fillColor="{fill_m}" android:pathData="{tr(M_D)}"/>'
             f'<path android:fillColor="{fill_dot}" android:pathData="{tr(DOT_D)}"/>')
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" '
            f'android:viewportWidth="108" android:viewportHeight="108">{paths}</vector>\n')


def write(path, content):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    open(path, 'w').write(content)


if __name__ == '__main__':
    o = os.path.dirname(os.path.abspath(__file__))
    S = os.path.join(o, 'svg')
    variants = {
        'mawred-symbol': symbol(),
        'mawred-symbol-small': symbol(small=True),
        'mawred-symbol-reversed': symbol(WHITE, ORANGE),
        'mawred-symbol-black': symbol('#000', '#000'),
        'mawred-symbol-white': symbol(WHITE, WHITE),
        'mawred-app-icon': symbol(WHITE, ORANGE, small=False, bg=BLUE, scale=0.78),
        'mawred-favicon': symbol(WHITE, ORANGE, small=True, bg=BLUE, rx=48, scale=0.86),
        'mawred-horizontal': horizontal(),
        'mawred-horizontal-reversed': horizontal(WHITE, ORANGE, WHITE, ORANGE),
        'mawred-horizontal-black': horizontal('#000', '#000', '#000', '#000'),
        'mawred-horizontal-white': horizontal(WHITE, WHITE, WHITE, WHITE),
        'mawred-stacked': stacked(),
        'mawred-stacked-reversed': stacked(WHITE, ORANGE, WHITE, ORANGE),
        'mawred-wordmark': wordmark(),
        'mawred-wordmark-reversed': wordmark(WHITE, ORANGE),
    }
    for k, v in variants.items():
        write(os.path.join(S, k + '.svg'), v)
    A = os.path.join(o, 'android')
    write(os.path.join(A, 'drawable', 'ic_launcher_foreground.xml'), android_vector('#FFFFFF', ORANGE))
    write(os.path.join(A, 'drawable', 'ic_launcher_monochrome.xml'), android_vector('#FFFFFF', '#FFFFFF'))
    write(os.path.join(A, 'values', 'ic_launcher_background.xml'),
          f'<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">{BLUE}</color></resources>\n')
    write(os.path.join(A, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
          '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">'
          '<background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@drawable/ic_launcher_foreground"/>'
          '<monochrome android:drawable="@drawable/ic_launcher_monochrome"/></adaptive-icon>\n')
    print('ok', len(variants))
