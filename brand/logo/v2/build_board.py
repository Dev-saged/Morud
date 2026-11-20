"""لوحة عرض فاخرة لمفاهيم شعار مورد: غلاف + مفهوم لكل شريحة + مقارنة. تخرج board.html وشرائح منفصلة."""
from marks import khatam, bawaba, mdot, symbol_svg, lockup_svg

F = 'file:///home/claude/sajed-brain/video-identity/templates/fonts/'
FONTS = [('Ruqaa', 'aref-ruqaa-ink-arabic-700-normal.woff2', 700), ('Amiri', 'amiri-arabic-700-normal.woff2', 700),
         ('Amiri', 'amiri-arabic-400-normal.woff2', 400), ('Messiri', 'el-messiri-arabic-700-normal.woff2', 700),
         ('Alex', 'alexandria-arabic-400-normal.woff2', 400), ('Alex', 'alexandria-arabic-600-normal.woff2', 600),
         ('Alex', 'alexandria-latin-400-normal.woff2', 400), ('Alex', 'alexandria-latin-600-normal.woff2', 600)]
FACES = "".join(f"@font-face{{font-family:{n};src:url({F}{f}) format('woff2');font-weight:{w}}}" for n, f, w in FONTS)

CONCEPTS = [
    dict(key='khatam', num='01', name='خاتم مورد', type='رمز هندسي عربي',
         idea='نجمة الثُّمانية العربية تحتضن عملة ذهبية نُقش عليها حرف الميم — ختم الجودة والأمانة على كل شحنة تخرج من مورد.',
         why=['النجمة الثمانية من أعرق رموز العمارة العربية: أصالة وثقة من أول نظرة.',
              'الذهب على الزمرّدي يعني القيمة والأمانة في التعامل المالي مع المحلات.',
              'كتلة صلبة واضحة: أيقونة تطبيق قوية، ختم على الكرتونة، ولافتة تُرى من بعيد.'],
         palette=[('#0B5D4B', 'زمرّدي مورد'), ('#D4AF5A', 'ذهبي'), ('#F4EEE2', 'عاجي'), ('#0E1A16', 'حبر')],
         sym=lambda: khatam(), rev=lambda: khatam('#D4AF5A', '#F4EEE2', '#0B5D4B'), mono=lambda c, bg='#000': khatam(c, bg, c),
         ar='#0B5D4B', lat='#B8923A', primary='#0B5D4B', accent='#D4AF5A', dark='#06352B', font='El Messiri'),
    dict(key='bawaba', num='02', name='بوابة مورد', type='رمز معماري + خط نسخي',
         idea='قوس عربي بإطار ذهبي يحتضن ميماً بخط الرقعة — البوابة التي تمر منها بضاعة كل المحلات.',
         why=['القوس العربي يمنح فخامة ورسوخاً يليق بمورد كبير يُعتمد عليه.',
              'الكحلي الملكي ثقة، والذهب جودة؛ وكلمة «مورد» بخط نسخي كلاسيكي واضح.',
              'شكل القوس نفسه أيقونة مميزة على الشاشة واللافتة والفاتورة.'],
         palette=[('#13294B', 'كحلي ملكي'), ('#C9A24A', 'ذهبي'), ('#E6C77A', 'ذهبي فاتح'), ('#F4EEE2', 'عاجي')],
         sym=lambda: bawaba(), rev=lambda: bawaba('#0A1830', '#C9A24A', '#E6C77A'), mono=lambda c, bg='#000': bawaba(c, bg, bg),
         ar='#13294B', lat='#B08A3E', primary='#13294B', accent='#C9A24A', dark='#0A1830', font='Amiri'),
    dict(key='mdot', num='03', name='M بالنقطة', type='حرف + نقطة',
         idea='حرف M خط توصيل واحد متصل ينتهي بنقطة برتقالية هي محلك — من المورد إلى بابك مباشرة.',
         why=['حديث وسريع الحفظ، ويعمل بالعربية والإنجليزية معاً.',
              'الأزرق ثقة والبرتقالي حركة الطلبات — مطابق لألوان وثيقة المشروع.',
              'خط واحد متصل يحكي قصة التوصيل دون أي رسم حرفي لشاحنة أو صندوق.'],
         palette=[('#1D4ED8', 'أزرق مورد'), ('#F08A24', 'برتقالي الطلب'), ('#FFFFFF', 'أبيض'), ('#0B1533', 'كحلي داكن')],
         sym=lambda: mdot(), rev=lambda: mdot('#FFFFFF', '#F08A24'), mono=lambda c, bg='#000': mdot(c, c),
         ar='#1D4ED8', lat='#F08A24', primary='#1D4ED8', accent='#F08A24', dark='#0B1533', font='Alexandria'),
]

CSS = FACES + """
*{box-sizing:border-box;margin:0;padding:0}
body{width:1600px;background:#0D0E10;color:#F2EBDD;font-family:Alex,sans-serif;direction:rtl}
.slide{position:relative;width:1600px;overflow:hidden;padding:110px 120px}
.gold{color:#D4B26A}
.kicker{font:600 22px Alex;letter-spacing:.02em;color:#B9A27A}
.pattern{position:absolute;inset:0;opacity:.07;pointer-events:none}
.cover{height:1100px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;
  background:radial-gradient(1200px 700px at 50% 45%,#1A1712 0%,#0D0E10 70%)}
.cover h1{font:700 250px/1.15 Amiri;color:#D9B868;margin:10px 0 0}
.cover .latin{font:600 34px Alex;letter-spacing:.6em;color:#CDBB95;margin-inline-start:.6em}
.cover .sub{font:700 46px Amiri;margin-top:60px;color:#F2EBDD}
.cover .line{width:180px;height:2px;background:#C9A24A;margin:44px auto}
.cover .meta{font:400 24px Alex;color:#9C927F}
.head{display:flex;align-items:flex-end;gap:40px;margin-bottom:56px}
.num{font:600 200px/0.8 Alex;color:transparent;-webkit-text-stroke:2px #C9A24A;direction:ltr}
.title h2{font:700 92px/1.05 Amiri;color:#F6EFE0}
.tag{display:inline-block;margin-top:14px;padding:8px 22px;border:1px solid #6E6045;border-radius:40px;font:600 21px Alex;color:#D4B26A}
.idea{font:400 31px/1.75 Alex;color:#D8D0C0;max-width:1180px;margin-bottom:60px}
.hero{display:grid;grid-template-columns:1fr 1.45fr;gap:28px;margin-bottom:28px}
.panel{border-radius:34px;display:flex;align-items:center;justify-content:center}
.panel.sym{height:560px}
.panel.lock{height:560px;background:#F4EEE2;flex-direction:column;gap:46px}
.panel.lock .rev{width:100%;height:190px;display:flex;align-items:center;justify-content:center}
.row2{display:grid;grid-template-columns:repeat(4,1fr);gap:28px;margin-bottom:28px}
.mock{height:330px;border-radius:30px;overflow:hidden;position:relative;background:#16171A}
.mock .cap{position:absolute;bottom:16px;right:18px;font:600 18px Alex;color:#F2EBDD;background:rgba(13,14,16,.82);padding:6px 16px;border-radius:20px}
.info{display:grid;grid-template-columns:1.25fr 1fr;gap:28px}
.card{background:#16171A;border:1px solid #26272B;border-radius:30px;padding:40px 44px}
.card h3{font:700 34px Amiri;color:#E9DCC0;margin-bottom:22px}
.why li{list-style:none;font:400 24px/1.7 Alex;color:#CFC7B7;padding-inline-start:30px;position:relative;margin-bottom:12px}
.why li:before{content:"";position:absolute;right:0;top:17px;width:12px;height:12px;transform:rotate(45deg);background:#C9A24A}
.chips{display:flex;gap:16px;margin-bottom:30px}
.chip{flex:1}
.chip i{display:block;height:92px;border-radius:18px;border:1px solid rgba(255,255,255,.12)}
.chip b{display:block;font:600 19px Alex;margin-top:10px;color:#E8DFCD}
.chip span{font:400 17px Alex;color:#8E8676;direction:ltr;display:block;text-align:right}
.sizes{display:flex;align-items:flex-end;gap:34px;margin-top:8px}
.sizes div{text-align:center;font:400 16px Alex;color:#8E8676}
.sizes .bx{background:#F4EEE2;border-radius:14px;padding:14px;margin-bottom:8px;display:flex;align-items:center;justify-content:center}
.sizes .bx.d{background:#000}
.compare{height:1260px;background:radial-gradient(1000px 600px at 50% 0,#1A1712 0,#0D0E10 70%)}
.compare h2{font:700 96px Amiri;text-align:center;margin-bottom:20px}
.compare .lead{font:400 28px Alex;color:#BDB4A3;text-align:center;margin-bottom:70px}
.trio{display:grid;grid-template-columns:repeat(3,1fr);gap:30px}
.trio .t{background:#F4EEE2;border-radius:34px;padding:50px 30px 40px;text-align:center;position:relative}
.trio .t.rec{outline:3px solid #C9A24A;outline-offset:8px}
.trio .t b{display:block;font:700 44px Amiri;color:#1B1B1B;margin-top:26px}
.trio .t span{font:400 21px Alex;color:#6B6455}
.badge{position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:#C9A24A;color:#17140D;font:700 20px Alex;padding:8px 26px;border-radius:30px;white-space:nowrap}
.verdict{margin-top:70px;text-align:center;font:400 28px/1.8 Alex;color:#D8D0C0;max-width:1150px;margin-inline:auto}
.foot{margin-top:70px;display:flex;justify-content:space-between;font:400 21px Alex;color:#7D7565;border-top:1px solid #26272B;padding-top:30px}
"""


def pattern(color='#C9A24A'):
    from marks import STAR
    cells = []
    for y in range(-1, 9):
        for x in range(-1, 11):
            cells.append(f'<polygon points="{STAR}" transform="translate({x * 170 + (85 if y % 2 else 0)} {y * 150}) scale(.62)" '
                         f'fill="none" stroke="{color}" stroke-width="2.2"/>')
    return f'<svg class="pattern" viewBox="0 0 1600 1200" preserveAspectRatio="xMidYMid slice">{"".join(cells)}</svg>'


def cover():
    return f'''<section class="slide cover">{pattern()}
<div class="kicker">عرض هوية الشعار</div>
<h1>مورد</h1><div class="latin">MAWRED</div>
<div class="line"></div>
<div class="sub">ثلاثة اتجاهات للاختيار</div>
<div class="meta" style="margin-top:18px">منصة التوريد والبيع بالجملة للمحلات التجارية</div>
</section>'''


def mock_app(c):
    return f'''<div class="mock" style="background:linear-gradient(160deg,{c['dark']},#0D0E10)">
<svg viewBox="0 0 360 330" width="100%" height="100%"><rect x="105" y="20" width="150" height="300" rx="28" fill="#0A0A0B" stroke="#2C2C30" stroke-width="3"/>
<rect x="114" y="30" width="132" height="280" rx="20" fill="{c['dark']}"/>
<rect x="128" y="62" width="48" height="48" rx="13" fill="#ffffff22"/><rect x="184" y="62" width="48" height="48" rx="13" fill="#ffffff22"/>
<rect x="128" y="186" width="48" height="48" rx="13" fill="#ffffff22"/><rect x="184" y="186" width="48" height="48" rx="13" fill="#ffffff22"/></svg>
<div style="position:absolute;top:118px;left:50%;transform:translateX(-50%);width:62px;height:62px;border-radius:16px;background:{c['primary']};display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(0,0,0,.45)">{symbol_svg(c['rev'](), 'width="50" height="50"')}</div>
<div class="cap">أيقونة التطبيق</div></div>'''


def mock_sign(c):
    lk = lockup_svg(c['key'], c['rev'](), '#F4EEE2', c['accent'], 'width="250" height="74"')
    return f'''<div class="mock" style="background:linear-gradient(#2a2d33,#1b1c20)">
<svg viewBox="0 0 360 330" width="100%" height="100%" style="position:absolute;inset:0">
<rect x="20" y="40" width="320" height="290" fill="#E9E2D3"/><rect x="20" y="40" width="320" height="96" fill="{c['primary']}"/>
<rect x="20" y="136" width="320" height="10" fill="{c['accent']}"/>
<g fill="#8FA4B3" opacity=".85"><rect x="44" y="170" width="120" height="160"/><rect x="196" y="170" width="120" height="110"/></g>
<rect x="196" y="280" width="120" height="50" fill="#4B4F57"/></svg>
<div style="position:absolute;top:52px;left:0;right:0;display:flex;justify-content:center">{lk}</div>
<div class="cap">لافتة المحل</div></div>'''


def mock_box(c):
    ink = '#5B3A1E'
    return f'''<div class="mock" style="background:#E7DFD0">
<svg viewBox="0 0 360 330" width="100%" height="100%" style="position:absolute;inset:0">
<polygon points="60,110 200,80 300,110 160,140" fill="#D6B486"/><polygon points="60,110 160,140 160,300 60,265" fill="#C49A68"/>
<polygon points="160,140 300,110 300,272 160,300" fill="#B98C58"/>
<line x1="110" y1="125" x2="250" y2="95" stroke="#A97D4B" stroke-width="10"/></svg>
<div style="position:absolute;top:150px;right:76px;transform:skewY(-11deg);opacity:.88">{symbol_svg(c['mono'](ink, '#B98C58'), 'width="96" height="96"')}</div>
<div class="cap">كرتونة التوريد</div></div>'''


def mock_invoice(c):
    lk = lockup_svg(c['key'], c['sym'](), c['ar'], c['lat'], 'width="150" height="44"')
    rows = "".join(f'<div style="display:flex;justify-content:space-between;font:400 11px Alex;color:#555;border-bottom:1px solid #eee;padding:6px 0">'
                   f'<span>{n}</span><span style="direction:ltr">{p}</span></div>'
                   for n, p in [('زيت ذرة ١.٨ لتر × ١٢', '₪ 312.00'), ('أرز مصري ٥ كغ × ٨', '₪ 248.00'), ('جبنة فيتا علبة × ٢٤', '₪ 192.00')])
    return f'''<div class="mock" style="background:#2B2C30">
<div style="position:absolute;top:28px;left:50%;transform:translateX(-50%) rotate(-3deg);width:250px;height:300px;background:#fff;border-radius:6px;padding:18px 18px;box-shadow:0 18px 40px rgba(0,0,0,.5)">
<div style="display:flex;justify-content:space-between;align-items:center">{lk}<span style="font:600 10px Alex;color:{c['ar']}">فاتورة</span></div>
<div style="height:3px;background:{c['accent']};margin:10px 0 8px"></div>
<div style="font:400 9px Alex;color:#888;margin-bottom:6px;direction:ltr;text-align:right">MW-I-2026-000045</div>{rows}
<div style="display:flex;justify-content:space-between;font:700 13px Alex;color:{c['ar']};margin-top:10px"><span>الإجمالي</span><span style="direction:ltr">₪ 752.00</span></div></div>
<div class="cap">الفاتورة</div></div>'''


def concept(c):
    big = symbol_svg(c['sym'](), 'width="380" height="380"')
    lk = lockup_svg(c['key'], c['sym'](), c['ar'], c['lat'], 'width="640" height="182"')
    lkr = lockup_svg(c['key'], c['rev'](), '#F4EEE2', c['accent'], 'width="520" height="148"')
    chips = "".join(f'<div class="chip"><i style="background:{h}"></i><b>{n}</b><span>{h}</span></div>' for h, n in c['palette'])
    def box(s):
        wh = f'width="{s}" height="{s}"'
        return f'<div><div class="bx" style="width:{s + 28}px;height:{s + 28}px">{symbol_svg(c["sym"](), wh)}</div>{s}px</div>'
    sizes = "".join(box(s) for s in (96, 64, 32, 16))
    mono = f'<div><div class="bx d" style="width:92px;height:92px">{symbol_svg(c["mono"]("#fff", "#000"), 'width="64" height="64"')}</div>لون واحد</div>'
    return f'''<section class="slide" style="background:radial-gradient(1100px 650px at 85% 0,{c['dark']}55 0,#0D0E10 65%)">
<div class="head"><div class="num">{c['num']}</div><div class="title"><div class="kicker">الاتجاه {c['num']}</div><h2>{c['name']}</h2><div class="tag">{c['type']}</div></div></div>
<p class="idea">{c['idea']}</p>
<div class="hero"><div class="panel sym" style="background:#F4EEE2">{big}</div>
<div class="panel lock" style="background:{c['primary']}"><div class="rev">{lkr}</div>
<div style="background:#F4EEE2;border-radius:24px;padding:34px 46px">{lk.replace('width="640" height="182"', 'width="560" height="160"')}</div></div></div>
<div class="row2">{mock_app(c)}{mock_sign(c)}{mock_box(c)}{mock_invoice(c)}</div>
<div class="info"><div class="card"><h3>لماذا يناسب مورد</h3><ul class="why">{"".join(f"<li>{w}</li>" for w in c['why'])}</ul></div>
<div class="card"><h3>الألوان والمقاسات</h3><div class="chips">{chips}</div><div class="sizes">{sizes}{mono}</div></div></div>
</section>'''


def compare(rec_key='khatam'):
    tiles = "".join(f'''<div class="t{' rec' if c['key'] == rec_key else ''}">{'<div class="badge">الترشيح</div>' if c['key'] == rec_key else ''}
{symbol_svg(c['sym'](), 'width="240" height="240"')}<b>{c['name']}</b><span>{c['type']}</span></div>''' for c in CONCEPTS)
    return f'''<section class="slide compare">{pattern()}
<div class="kicker" style="text-align:center">المقارنة</div><h2>أيّ الاتجاهات يمثّل مورد؟</h2>
<p class="lead">الثلاثة مبنية هندسياً ومختبرة حتى 16 بكسل ولون واحد، وجاهزة للتطوير إلى هوية كاملة.</p>
<div class="trio">{tiles}</div>
<p class="verdict"><b class="gold">ترشيحنا: خاتم مورد.</b> أكثرها تميزاً وعروبة في قطاع التوريد، يجمع الأصالة (النجمة) والقيمة (الذهب) والاسم (الميم)، ويبقى قوياً كأيقونة تطبيق وختم على الكرتونة.</p>
<div class="foot"><span>مورد · MAWRED</span><span>تصميم: ساجد العبادلة · من غزة</span></div>
</section>'''


def page(body):
    return f'<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{body}</body></html>'


if __name__ == '__main__':
    import os
    os.makedirs('slides', exist_ok=True)
    parts = [('01-cover', cover())] + [(f'0{i + 2}-{c["key"]}', concept(c)) for i, c in enumerate(CONCEPTS)] + [('05-compare', compare())]
    open('board.html', 'w').write(page("".join(p for _, p in parts)))
    for name, html in parts:
        open(f'slides/{name}.html', 'w').write(page(html))
    print('ok', len(parts))
