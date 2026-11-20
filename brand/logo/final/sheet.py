"""لوحة الهوية المعتمدة لمورد («M بالنقطة») — صورة واحدة للعميل."""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'v2'))
sys.path.insert(0, HERE)
import kit  # noqa: E402
import build_board as bb  # noqa: E402


def inner(svg):
    return re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1)


def sized(svg, w, h):
    return svg.replace('<svg ', f'<svg width="{w}" height="{h}" ', 1)


B, O, N, P = kit.BLUE, kit.ORANGE, kit.NAVY, kit.PAPER
c = dict(bb.CONCEPTS[2])
c.update(sym=lambda: inner(kit.symbol()), rev=lambda: inner(kit.symbol(kit.WHITE, O)),
         mono=lambda col, bg='#000': inner(kit.symbol(col, col)))


def lockup_override(kind, sym_inner, ar, lat, extra=''):
    rev = ar.upper() in ('#FFFFFF', '#F4EEE2')
    svg = kit.horizontal(kit.WHITE, O, kit.WHITE, O) if rev else kit.horizontal()
    m = re.search(r'width="(\d+)" height="(\d+)"', extra)
    return sized(svg, m.group(1), m.group(2)) if m else svg


bb.lockup_svg = lockup_override

EXTRA_CSS = """
.hdr{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:50px}
.hdr h1{font:700 96px/1.1 Amiri;color:#F6EFE0}
.hdr .ok{font:600 22px Alex;color:#17140D;background:#D4B26A;padding:10px 26px;border-radius:30px}
.g2{display:grid;grid-template-columns:1.5fr 1fr;gap:28px;margin-bottom:28px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px;margin-bottom:28px}
.p{border-radius:34px;display:flex;align-items:center;justify-content:center;position:relative}
.p .lbl{position:absolute;bottom:20px;right:26px;font:600 18px Alex;color:#8E8676}
.space{position:relative;padding:44px;border:2px dashed #C9A24A88}
.don li{list-style:none;font:400 22px/1.7 Alex;color:#CFC7B7;padding-inline-start:28px;position:relative}
.don li:before{content:"";position:absolute;right:0;top:15px;width:14px;height:3px;background:#E0574F}
"""


def sheet():
    big_rev = sized(kit.horizontal(kit.WHITE, O, kit.WHITE, O), 820, 220)
    big = sized(kit.horizontal(), 520, 140)
    stacked = sized(kit.stacked(), 300, 340)
    app = sized(kit.symbol(kit.WHITE, O, bg=B, scale=0.78), 230, 230)
    sizes = "".join(f'<div style="text-align:center;font:400 16px Alex;color:#8E8676"><div style="background:#fff;border-radius:12px;padding:12px;margin-bottom:8px">'
                    f'{sized(kit.symbol(small=s <= 32), s, s)}</div>{s}px</div>' for s in (128, 64, 32, 16))
    favs = "".join(f'<div style="text-align:center;font:400 16px Alex;color:#8E8676">{sized(kit.symbol(kit.WHITE, O, small=True, bg=B, rx=48, scale=.86), s, s)}<div>{s}px</div></div>'
                   for s in (64, 32, 16))
    chips = "".join(f'<div class="chip"><i style="background:{v["hex"]}"></i><b>{v["label"]}</b><span>{v["hex"]}</span>'
                    f'<span style="font-size:13px">{v["oklch"]}</span></div>'
                    for v in __import__('json').load(open(os.path.join(HERE, '..', '..', '..', 'spec', 'brand.json')))['colors'].values())
    return f'''<section class="slide" style="background:radial-gradient(1100px 650px at 85% 0,#0B153399 0,#0D0E10 65%)">
<div class="hdr"><div><div class="kicker">الهوية المعتمدة</div><h1>مورد · M بالنقطة</h1></div><div class="ok">الاتجاه المختار</div></div>
<div class="p" style="background:{B};height:440px;margin-bottom:28px">{big_rev}<div class="lbl" style="color:#C9D6FF">الشعار الأفقي — معكوس</div></div>
<div class="g2"><div class="p" style="background:{P};height:360px">{big}<div class="lbl">الشعار الأفقي — الأساسي</div></div>
<div class="p" style="background:{P};height:360px">{stacked}<div class="lbl">العمودي</div></div></div>
<div class="g3"><div class="p" style="background:#16171A;height:330px;flex-direction:column;gap:18px">{app}<div style="font:600 20px Alex;color:#E8DFCD">أيقونة التطبيق</div></div>
<div class="p" style="background:#16171A;height:330px;gap:22px;align-items:flex-end;padding-bottom:70px">{sizes}<div class="lbl">نسخة المقاسات الصغيرة تحت 32px</div></div>
<div class="p" style="background:#16171A;height:330px;gap:26px;align-items:flex-end;padding-bottom:70px">{favs}<div class="lbl">أيقونة المتصفح</div></div></div>
<div class="row2">{bb.mock_app(c)}{bb.mock_sign(c)}{bb.mock_box(c)}{bb.mock_invoice(c)}</div>
<div class="info"><div class="card"><h3>الألوان</h3><div class="chips">{chips}</div></div>
<div class="card"><h3>قواعد سريعة</h3>
<div style="display:flex;gap:30px;align-items:center;margin-bottom:22px"><div class="space" style="background:{P};border-radius:16px">{sized(kit.horizontal(), 220, 60)}</div>
<div style="font:400 20px/1.6 Alex;color:#CFC7B7">مساحة آمنة = قطر النقطة البرتقالية<br>أصغر عرض للأفقي 120px · للرمز 16px</div></div>
<ul class="don"><li>لا تمطّ الشعار ولا تدوّره ولا تضف ظلاً</li><li>لا تفصل النقطة ولا تغيّر لونها</li><li>لا ألوان خارج اللوحة</li></ul></div></div>
<div class="foot"><span>مورد · MAWRED</span><span>تصميم: ساجد العبادلة · من غزة</span></div>
</section>'''


if __name__ == '__main__':
    html = f'<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>{bb.CSS}{EXTRA_CSS}</style></head><body>{sheet()}</body></html>'
    open(os.path.join(HERE, 'identity-sheet.html'), 'w').write(html)
    print('ok')
