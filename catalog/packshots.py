"""صور منتجات مبدئية موحّدة (packshot) لكل صنف: خلفية شفافة + علامة مورد.
تُستبدل بصورة حقيقية عند رفعها من لوحة الإدارة (تفريغ تلقائي + علامة مورد)."""
import json, os, subprocess, sys
from PIL import Image, ImageDraw

S = 800
CAT = {"frozen": "#2B7BD6", "staples": "#B7791F", "dairy": "#3B82C4", "snacks": "#D9480F", "beverages": "#0F9D8A", "cleaning": "#5B5BD6",
       "baby": "#E46FA1", "personal_care": "#7C4DCC", "produce": "#2F9E44", "household": "#6B7280", "canned": "#C2410C", "spices": "#A16207"}

def esc(t): return t.replace("&", "&amp;").replace("<", "&lt;")

def label(cx, cy, w, h, name, band, size=40):
    words = name.split()
    lines, cur = [], ""
    for wd in words:
        if len(cur) + len(wd) + 1 > 13 and cur: lines.append(cur); cur = wd
        else: cur = (cur + " " + wd).strip()
    if cur: lines.append(cur)
    lines = lines[:3]
    fs = size if len(lines) <= 2 else size * 0.85
    y0 = cy - (len(lines) - 1) * fs * 0.62
    txt = "".join(f'<text x="{cx}" y="{y0 + i * fs * 1.24 + fs * 0.35:.0f}" font-family="IBM Plex Sans Arabic" font-weight="600" font-size="{fs:.0f}" text-anchor="middle" fill="#1A1F2B" direction="rtl">{esc(l)}</text>' for i, l in enumerate(lines))
    return (f'<rect x="{cx - w / 2}" y="{cy - h / 2}" width="{w}" height="{h}" rx="22" fill="#FFFFFF"/>'
            f'<rect x="{cx - w / 2}" y="{cy - h / 2}" width="{w}" height="14" rx="7" fill="{band}"/>' + txt)

def shadow(cx=400, cy=700, rx=230): return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="34" fill="#000" opacity="0.13"/>'

def grad(id, c1, c2): return f'<linearGradient id="{id}" x1="0" x2="1"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>'

def shade(hexc, k):
    h = hexc.lstrip("#"); r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    f = lambda v: max(0, min(255, int(v * k if k < 1 else v + (255 - v) * (k - 1))))
    return f"#{f(r):02X}{f(g):02X}{f(b):02X}"

def pack(kind, c, name, band):
    d, l = shade(c, 0.78), shade(c, 1.25)
    G = grad("g", d, l)
    if kind == "bag":
        body = f'<path d="M230 170 Q400 140 570 170 L600 650 Q400 690 200 650 Z" fill="url(#g)"/><path d="M230 170 L250 130 Q400 105 550 130 L570 170 Q400 140 230 170Z" fill="{d}"/>'
        return G, body + label(400, 420, 300, 200, name, band)
    if kind == "box":
        body = f'<path d="M200 230 L400 170 L600 230 L400 290 Z" fill="{l}"/><path d="M200 230 L400 290 L400 680 L200 620 Z" fill="{d}"/><path d="M400 290 L600 230 L600 620 L400 680 Z" fill="{c}"/>'
        return G, body + label(400, 470, 0, 0, "", band).replace('<rect', '<rect opacity="0"', 2) + f'<g transform="translate(500 455) skewY(-17)">{label(0, 0, 170, 190, name, band, 30)}</g>'
    if kind == "bottle":
        body = f'<rect x="355" y="95" width="90" height="60" rx="14" fill="{d}"/><path d="M370 155 L430 155 L440 215 Q560 250 560 330 L560 640 Q560 680 520 680 L280 680 Q240 680 240 640 L240 330 Q240 250 360 215 Z" fill="url(#g)"/>'
        return G, body + label(400, 470, 280, 210, name, band, 36)
    if kind == "can":
        body = f'<rect x="250" y="210" width="300" height="430" fill="url(#g)"/><ellipse cx="400" cy="640" rx="150" ry="36" fill="{d}"/><ellipse cx="400" cy="210" rx="150" ry="36" fill="#C9CED6"/><ellipse cx="400" cy="210" rx="128" ry="27" fill="#E3E7EC"/>'
        return G, body + label(400, 430, 270, 190, name, band, 34)
    if kind == "jar":
        body = f'<rect x="270" y="170" width="260" height="70" rx="18" fill="{d}"/><rect x="230" y="240" width="340" height="430" rx="60" fill="url(#g)"/>'
        return G, body + label(400, 460, 280, 200, name, band, 36)
    if kind == "sack":
        body = f'<path d="M260 200 Q400 165 540 200 L590 660 Q400 700 210 660 Z" fill="#E9DFC6"/><path d="M300 150 Q400 135 500 150 L540 200 Q400 170 260 200Z" fill="#D8CBA8"/><path d="M330 150 L470 150" stroke="#8C7B55" stroke-width="10"/>'
        return G, body + label(400, 430, 290, 200, name, band, 38) + f'<rect x="260" y="560" width="280" height="40" rx="10" fill="{c}"/>'
    if kind == "tub":
        body = f'<path d="M230 300 L570 300 L540 650 Q400 680 260 650 Z" fill="url(#g)"/><ellipse cx="400" cy="300" rx="175" ry="44" fill="{l}"/><ellipse cx="400" cy="292" rx="175" ry="44" fill="#FFFFFF" opacity="0.85"/>'
        return G, body + label(400, 480, 260, 170, name, band, 32)
    if kind == "carton":
        body = f'<path d="M260 230 L400 150 L540 230 Z" fill="{l}"/><rect x="380" y="120" width="40" height="40" fill="{d}"/><rect x="260" y="230" width="280" height="450" fill="url(#g)"/>'
        return G, body + label(400, 470, 240, 230, name, band, 32)
    if kind == "tube":
        body = f'<path d="M200 330 L560 300 L620 360 L620 440 L560 500 L200 470 Z" fill="url(#g)"/><rect x="620" y="370" width="50" height="60" rx="8" fill="{d}"/>'
        return G, body + label(390, 400, 260, 120, name, band, 30)
    if kind == "spray":
        body = f'<rect x="330" y="130" width="80" height="60" rx="10" fill="{d}"/><rect x="405" y="145" width="60" height="20" rx="6" fill="{d}"/><rect x="290" y="190" width="220" height="480" rx="50" fill="url(#g)"/>'
        return G, body + label(400, 450, 190, 210, name, band, 28)
    if kind == "roll":
        body = f'<rect x="240" y="230" width="320" height="380" rx="20" fill="#FFFFFF" stroke="#DDE2E8" stroke-width="6"/><ellipse cx="400" cy="230" rx="160" ry="40" fill="#F1F4F7"/><ellipse cx="400" cy="230" rx="45" ry="12" fill="#B9C0C8"/>'
        return G, body + label(400, 450, 280, 170, name, band, 32)
    if kind == "pack":
        body = f'<rect x="200" y="200" width="400" height="470" rx="40" fill="url(#g)"/><rect x="200" y="200" width="400" height="80" rx="40" fill="{d}"/>'
        return G, body + label(400, 470, 310, 220, name, band, 36)
    raise ValueError(kind)

def produce(kind, c, name):
    d, l = shade(c, 0.75), shade(c, 1.3)
    G = grad("g", d, l)
    leaf = f'<path d="M400 230 Q430 160 500 165 Q470 230 400 240Z" fill="#2F9E44"/>'
    if kind == "round": return G, f'<circle cx="400" cy="440" r="210" fill="url(#g)"/><ellipse cx="330" cy="370" rx="50" ry="30" fill="#FFF" opacity="0.35"/>' + leaf
    if kind == "long": return G, f'<g transform="rotate(-28 400 430)"><rect x="170" y="350" width="460" height="160" rx="80" fill="url(#g)"/><path d="M600 380 Q680 360 700 300" stroke="#2F9E44" stroke-width="22" fill="none" stroke-linecap="round"/></g>'
    if kind == "banana": return G, f'<path d="M210 300 Q300 640 640 560 Q660 600 600 620 Q250 680 180 320 Z" fill="url(#g)"/><path d="M200 300 L180 250" stroke="#5C4B1E" stroke-width="22" stroke-linecap="round"/>'
    if kind == "fish": return G, f'<path d="M150 430 Q330 250 560 400 L680 300 L660 430 L680 560 L560 460 Q330 610 150 430 Z" fill="url(#g)"/><circle cx="250" cy="410" r="14" fill="#1A1F2B"/><path d="M380 330 Q420 430 380 530" stroke="{d}" stroke-width="8" fill="none"/>'
    if kind == "drumstick": return G, f'<path d="M260 520 Q170 380 300 260 Q450 160 540 300 Q590 400 470 470 L420 520 Z" fill="url(#g)"/><rect x="420" y="480" width="150" height="46" rx="23" transform="rotate(35 420 480)" fill="#F4EBDD"/><circle cx="560" cy="610" r="34" fill="#F4EBDD"/><circle cx="600" cy="580" r="30" fill="#F4EBDD"/>'
    if kind == "steak": return G, f'<path d="M190 380 Q230 240 420 250 Q620 260 620 420 Q610 600 400 610 Q200 600 190 380Z" fill="url(#g)"/><path d="M260 400 Q400 330 540 420" stroke="#F8E0D8" stroke-width="22" fill="none" stroke-linecap="round"/>'
    if kind == "shrimp": return G, f'<path d="M560 300 Q640 420 540 540 Q420 640 300 560 Q380 560 420 500 Q480 420 420 350 Z" fill="url(#g)"/><path d="M300 560 L230 610 L250 530 Z" fill="{d}"/>'
    if kind == "whole_chicken": return G, f'<ellipse cx="400" cy="450" rx="240" ry="180" fill="url(#g)"/><ellipse cx="230" cy="420" rx="70" ry="60" fill="{l}"/><ellipse cx="570" cy="420" rx="70" ry="60" fill="{l}"/><rect x="240" y="300" width="320" height="40" rx="20" fill="#FFFFFF" opacity="0.5"/>'
    if kind == "tray": return G, f'<rect x="160" y="330" width="480" height="270" rx="30" fill="#E9DFC6"/>' + "".join(f'<ellipse cx="{230 + 115 * (i % 4)}" cy="{400 + 110 * (i // 4)}" rx="48" ry="58" fill="#F6E7CF" stroke="#E2CDA6" stroke-width="4"/>' for i in range(8))
    if kind == "nuts": return G, f'<path d="M210 400 Q400 330 590 400 L560 620 Q400 660 240 620Z" fill="#C8A26B"/>' + "".join(f'<ellipse cx="{260 + 60 * (i % 6)}" cy="{380 + 30 * (i // 6)}" rx="34" ry="24" fill="url(#g)"/>' for i in range(12))
    if kind == "pile": return G, "".join(f'<circle cx="{280 + 80 * (i % 4)}" cy="{560 - 90 * (i // 4) - (i % 2) * 20}" r="{60 - (i // 4) * 4}" fill="url(#g)"/>' for i in range(10))
    if kind == "bucket": return G, f'<path d="M230 300 L570 300 L530 650 L270 650 Z" fill="url(#g)"/><ellipse cx="400" cy="300" rx="170" ry="40" fill="{l}"/><path d="M230 300 Q400 120 570 300" stroke="#4B5563" stroke-width="10" fill="none"/>'
    if kind == "jerrycan": return G, f'<rect x="230" y="230" width="340" height="440" rx="40" fill="url(#g)"/><rect x="290" y="170" width="140" height="70" rx="18" fill="{d}"/><rect x="470" y="190" width="60" height="60" rx="10" fill="{d}"/>'
    if kind == "stack": return G, "".join(f'<rect x="210" y="{540 - 70 * i}" width="380" height="64" rx="26" fill="url(#g)" stroke="#FFF" stroke-width="4"/>' for i in range(5))
    if kind == "plates": return G, "".join(f'<ellipse cx="400" cy="{560 - 22 * i}" rx="240" ry="60" fill="#FFFFFF" stroke="#D5DAE0" stroke-width="5"/>' for i in range(8))
    if kind == "lighter": return G, f'<rect x="330" y="260" width="140" height="380" rx="26" fill="url(#g)"/><rect x="345" y="200" width="110" height="80" rx="12" fill="#C9CED6"/>'
    if kind == "coal": return G, "".join(f'<polygon points="{x},{y} {x + 70},{y - 30} {x + 120},{y + 20} {x + 60},{y + 70}" fill="url(#g)"/>' for x, y in [(220, 560), (330, 520), (450, 560), (280, 460), (400, 430), (520, 470)])
    if kind == "wood": return G, "".join(f'<rect x="200" y="{350 + 70 * i}" width="400" height="60" rx="30" fill="url(#g)"/><circle cx="600" cy="{380 + 70 * i}" r="30" fill="#E9C99A"/>' for i in range(4))
    if kind == "gas": return G, f'<rect x="270" y="250" width="260" height="420" rx="90" fill="url(#g)"/><rect x="350" y="170" width="100" height="90" rx="14" fill="#9CA3AF"/>'
    if kind == "burger": return G, f'<path d="M210 420 Q400 200 590 420Z" fill="#D9A15B"/><rect x="200" y="420" width="400" height="50" rx="20" fill="#5B3A29"/><rect x="190" y="470" width="420" height="30" rx="15" fill="#3F9142"/><path d="M210 500 L590 500 Q590 600 400 600 Q210 600 210 500Z" fill="#D9A15B"/>'
    if kind == "sausage": return G, "".join(f'<rect x="200" y="{370 + 70 * i}" width="400" height="60" rx="30" fill="url(#g)" transform="rotate(-12 400 {400 + 70 * i})"/>' for i in range(3))
    if kind == "fries": return G, f'<path d="M260 380 L540 380 L510 660 L290 660 Z" fill="#D7263D"/>' + "".join(f'<rect x="{280 + 34 * i}" y="{220 + (i % 3) * 25}" width="26" height="200" rx="6" fill="#F5C342"/>' for i in range(8))
    raise ValueError(kind)

MAP = {
 "chicken": ("p", "whole_chicken", "#F2C99A"), "chicken_part": ("p", "drumstick", "#E6A96B"), "meat": ("p", "steak", "#C0392B"), "fish": ("p", "fish", "#8FA7B8"), "shrimp": ("p", "shrimp", "#F28C5B"),
 "box_red": ("k", "box", "#C0392B"), "veg_green": ("k", "bag", "#3F9142"), "veg_leaf": ("k", "bag", "#2B6B2E"), "veg_mix": ("k", "bag", "#E08A1E"), "fries": ("p", "fries", "#F5C342"),
 "burger": ("p", "burger", "#D9A15B"), "sausage": ("p", "sausage", "#D98E73"),
 "sack": ("k", "sack", "#9C6B30"), "sack_rice": ("k", "sack", "#3B7A57"), "sack_flour": ("k", "sack", "#B7791F"), "sack_lentil": ("k", "sack", "#D9480F"), "sack_beans": ("k", "sack", "#7A5C2E"),
 "bottle_oil": ("k", "bottle", "#E7B10A"), "jar": ("k", "jar", "#B98543"), "bag_salt": ("k", "bag", "#5B8DEF"), "pasta": ("k", "bag", "#E0A526"),
 "milk_carton": ("k", "carton", "#3B82C4"), "milk_powder": ("k", "can", "#4F6BD8"), "yogurt": ("k", "tub", "#4C9AD9"), "cheese_can": ("k", "can", "#2E86C1"), "cheese": ("k", "pack", "#E8B931"),
 "cheese_round": ("k", "tub", "#D93A3A"), "butter": ("k", "pack", "#E3B23C"), "eggs": ("p", "tray", "#F6E7CF"),
 "chips": ("k", "bag", "#E8590C"), "biscuit": ("k", "pack", "#8B5E34"), "chocolate": ("k", "pack", "#5B3A29"), "nuts": ("p", "nuts", "#B98543"), "cake": ("k", "pack", "#E46F8C"), "candy": ("k", "box", "#D6336C"),
 "water": ("k", "bottle", "#5BB5E8"), "soda": ("k", "can", "#C9302C"), "soda_orange": ("k", "can", "#F08A24"), "juice": ("k", "carton", "#F59F00"), "tea": ("k", "box", "#B03A2E"), "coffee": ("k", "pack", "#6F4E37"),
 "detergent_box": ("k", "box", "#2563EB"), "detergent": ("k", "bottle", "#5B5BD6"), "dish_soap": ("k", "bottle", "#2FB344"), "bleach": ("k", "bottle", "#E5E7EB"), "soap": ("k", "pack", "#7FB069"), "spray": ("k", "spray", "#3BA3D9"),
 "sponge": ("k", "pack", "#F2C94C"), "trash_bags": ("k", "roll", "#111827"), "bottle": ("k", "bottle", "#0F766E"),
 "diapers": ("k", "pack", "#4DABF7"), "formula": ("k", "can", "#F3A7C3"), "wipes": ("k", "pack", "#9AD0EC"), "shampoo": ("k", "bottle", "#E879B9"), "bottle_baby": ("k", "bottle", "#A5D8FF"),
 "cream": ("k", "tube", "#9B8AE0"), "powder": ("k", "bottle", "#F8C8DC"), "toothpaste": ("k", "tube", "#E03131"), "toothbrush": ("k", "pack", "#228BE6"), "pads": ("k", "pack", "#CC5DE8"),
 "pump": ("k", "bottle", "#38D9A9"), "razor": ("k", "pack", "#495057"), "toilet_paper": ("k", "roll", "#FFFFFF"), "tissue": ("k", "box", "#74C0FC"),
 "tomato": ("p", "round", "#E03131"), "potato": ("p", "pile", "#C9A86A"), "onion": ("p", "round", "#9C2C77"), "cucumber": ("p", "long", "#2F9E44"), "eggplant": ("p", "long", "#5F3DC4"),
 "pepper": ("p", "round", "#F59F00"), "lemon": ("p", "round", "#FAD02C"), "apple": ("p", "round", "#C92A2A"), "banana": ("p", "banana", "#FCC419"), "carrot": ("p", "long", "#F76707"),
 "bucket": ("p", "bucket", "#1C7ED6"), "jerrycan": ("p", "jerrycan", "#2B8A3E"), "gas": ("p", "gas", "#1971C2"), "coal": ("p", "coal", "#343A40"), "wood": ("p", "wood", "#A0522D"),
 "tape": ("k", "roll", "#ADB5BD"), "rope": ("k", "roll", "#C9A86A"), "tarp": ("p", "stack", "#1C7ED6"), "blanket": ("p", "stack", "#AE3EC9"), "lighter": ("p", "lighter", "#F03E3E"), "plates": ("p", "plates", "#FFFFFF"),
 "can_tuna": ("k", "can", "#1864AB"), "can": ("k", "can", "#B5651D"), "can_red": ("k", "can", "#C92A2A"), "can_yellow": ("k", "can", "#F2B705"),
 "spice_green": ("k", "jar", "#5C7F2E"), "spice_brown": ("k", "jar", "#8B5A2B"), "spice_dark": ("k", "jar", "#343A40"), "spice_red": ("k", "jar", "#9B2226"), "spice_white": ("k", "bag", "#ADB5BD"), "spice_yellow": ("k", "jar", "#E8A317"),
 "yeast": ("k", "pack", "#D4A017"), "stock_cube": ("k", "box", "#E8A317"),
}

MARK = "M43 59V191a15 15 0 0 0 30 0V100l42 47a15 15 0 0 0 22 0l42-47v41a15 15 0 0 0 30 0V59a15 15 0 0 0-26-10l-57 64-57-64a15 15 0 0 0-26 10z"

def mark_rect(w, h):
    size = max(40, round(min(w, h) * 0.14)); pad = round(min(w, h) * 0.03)
    return pad, h - size - pad, size

def mark_svg():
    x, y, size = mark_rect(S, S)
    k = size * 0.76 / 256
    return (f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{size * 0.22:.1f}" fill="#FFFFFF" opacity="0.92"/>'
            f'<g transform="translate({x + size * 0.12:.1f} {y + size * 0.12:.1f}) scale({k:.4f})"><path d="{MARK}" fill="#1D4ED8"/><circle cx="194" cy="193" r="19" fill="#F08A24"/></g>')

def svg_for(p):
    kind, shape, color = MAP[p["icon"]]
    short = p["name"]
    if kind == "k": defs, body = pack(shape, color, short, CAT[p["categoryId"]])
    else: defs, body = produce(shape, color, short)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}" viewBox="0 0 {S} {S}"><defs>{defs}</defs>{shadow()}{body}{mark_svg()}</svg>'

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "catalog/images"
    os.makedirs(out, exist_ok=True)
    data = json.load(open("catalog/seed.json"))
    for p in data["products"]:
        svg = os.path.join(out, p["sku"] + ".svg"); png = os.path.join(out, p["sku"] + ".png")
        open(svg, "w").write(svg_for(p))
        subprocess.run(["rsvg-convert", "-w", str(S), "-h", str(S), "-o", png, svg], check=True)
        im = Image.open(png); assert im.mode == "RGBA" and im.getpixel((5, 5))[3] == 0, p["sku"]
        os.remove(svg)
    print("ok", len(data["products"]))
