"""ورقة مراجعة بصرية: candidates = كل المرشحات لكل منتج مرقّمة، finals = النتائج المفرّغة على خلفية فاتحة."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
F = ImageFont.load_default(size=22)

def candidates(skus, out, cell=190):
    rows = []
    for sku in skus:
        d = os.path.join(HERE, 'photos', 'cand', sku)
        meta = json.load(open(os.path.join(d, 'meta.json'))) if os.path.exists(os.path.join(d, 'meta.json')) else []
        all_ = [(i, m) for i, m in enumerate(meta)]
        sel = all_[-8:] if os.environ.get('LAST') else all_[:8]
        rows.append((sku, [(i, Image.open(os.path.join(d, m['file'])).convert('RGB'), m['src']) for i, m in sel]))
    W = 150 + 8 * (cell + 8); H = len(rows) * (cell + 12) + 8
    sh = Image.new('RGB', (W, H), 'white'); dr = ImageDraw.Draw(sh)
    for r, (sku, ims) in enumerate(rows):
        y = 8 + r * (cell + 12)
        dr.text((8, y + cell // 2 - 12), sku, fill='black', font=F)
        for pos, (i, im, src) in enumerate(ims):
            im.thumbnail((cell, cell)); x = 150 + pos * (cell + 8)
            sh.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
            dr.rectangle([x, y, x + 34, y + 26], fill='#1D4ED8'); dr.text((x + 8, y + 1), f'{i}', fill='white', font=F)
            dr.text((x + cell - 30, y + cell - 24), 'O' if src == 'off' else 'C', fill='#F08A24', font=F)
    sh.save(out)

def finals(skus, out, cell=230, cols=6):
    W = cols * (cell + 10) + 10; H = ((len(skus) + cols - 1) // cols) * (cell + 40) + 10
    sh = Image.new('RGB', (W, H), '#F4F2EE'); dr = ImageDraw.Draw(sh)
    for k, sku in enumerate(skus):
        p = os.path.join(HERE, 'photos', 'final', f'{sku}.webp')
        x = 10 + (k % cols) * (cell + 10); y = 10 + (k // cols) * (cell + 40)
        dr.rounded_rectangle([x, y, x + cell, y + cell], 16, fill='white')
        if os.path.exists(p):
            im = Image.open(p).convert('RGBA'); im.thumbnail((cell, cell)); sh.paste(im, (x, y), im)
        dr.text((x + 6, y + cell + 6), sku, fill='black', font=F)
    sh.save(out)

if __name__ == '__main__':
    kind, out, *skus = sys.argv[1:]
    (candidates if kind == 'c' else finals)(skus, out)
