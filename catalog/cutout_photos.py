"""تفريغ الصور الحقيقية المختارة: إزالة الخلفية (rembg/isnet)، قصّ على حدود المنتج، توسيط في مربع موحّد، علامة مورد، WebP رئيسية + مصغّرة."""
import io, json, os, subprocess, sys
from PIL import Image
from rembg import new_session, remove

HERE = os.path.dirname(os.path.abspath(__file__))
CAND, OUT = os.path.join(HERE, 'photos', 'cand'), os.path.join(HERE, 'photos', 'final')
S, THUMB = 1000, 360
MARK = "M43 59V191a15 15 0 0 0 30 0V100l42 47a15 15 0 0 0 22 0l42-47v41a15 15 0 0 0 30 0V59a15 15 0 0 0-26-10l-57 64-57-64a15 15 0 0 0-26 10z"

def mark_rect(w, h):
    size = max(40, round(min(w, h) * 0.14)); pad = round(min(w, h) * 0.03)
    return pad, h - size - pad, size

def mark_png(size):
    k = size * 0.76 / 256
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}"><rect width="{size}" height="{size}" rx="{size * 0.22:.1f}" fill="#FFFFFF" opacity="0.92"/>'
           f'<g transform="translate({size * 0.12:.1f} {size * 0.12:.1f}) scale({k:.4f})"><path d="{MARK}" fill="#1D4ED8"/><circle cx="194" cy="193" r="19" fill="#F08A24"/></g></svg>')
    return Image.open(io.BytesIO(subprocess.run(['rsvg-convert'], input=svg.encode(), capture_output=True, check=True).stdout)).convert('RGBA')

def compose(cut: Image.Image) -> Image.Image:
    a = cut.getchannel('A').point(lambda v: 255 if v > 24 else 0)
    box = a.getbbox()
    if not box: raise ValueError('التفريغ فارغ')
    obj = cut.crop(box)
    inner = int(S * 0.80)
    k = min(inner / obj.width, inner / obj.height)
    obj = obj.resize((max(1, round(obj.width * k)), max(1, round(obj.height * k))), Image.LANCZOS)
    canvas = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    canvas.alpha_composite(obj, ((S - obj.width) // 2, (S - obj.height) // 2 - int(S * 0.02)))
    x, y, size = mark_rect(S, S)
    canvas.alpha_composite(mark_png(size), (x, y))
    return canvas

def compose_full(src: Image.Image) -> Image.Image:
    """صورة مقصوصة على العبوة أصلاً (لا خلفية تُزال): الصورة كاملة بزوايا دائرية داخل المربع الموحّد."""
    inner = int(S * 0.86)
    k = min(inner / src.width, inner / src.height)
    im = src.convert('RGBA').resize((max(1, round(src.width * k)), max(1, round(src.height * k))), Image.LANCZOS)
    r = int(min(im.size) * 0.06)
    mask = Image.new('L', im.size, 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.width - 1, im.height - 1], r, fill=255)
    im.putalpha(mask)
    canvas = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((S - im.width) // 2, (S - im.height) // 2))
    x, y, size = mark_rect(S, S)
    canvas.alpha_composite(mark_png(size), (x, y))
    return canvas

def run(choices: dict, model='isnet-general-use'):
    os.makedirs(OUT, exist_ok=True)
    sess = new_session(model)
    credits = []
    only = set(os.environ.get('ONLY', '').split()) - {''}
    for sku, val in choices.items():
        idx, mode = (val, 'cut') if isinstance(val, int) else (val[0], val[1])
        meta = json.load(open(os.path.join(CAND, sku, 'meta.json')))
        c = meta[idx]
        credits.append({'sku': sku, 'mode': mode, **{k: c[k] for k in ('src', 'title', 'page', 'license', 'licenseUrl', 'author')}})
        if only and sku not in only: continue
        src = Image.open(os.path.join(CAND, sku, c['file'])).convert('RGB')
        if max(src.size) > 1600: src.thumbnail((1600, 1600))
        img = compose_full(src) if mode == 'full' else compose(remove(src, session=sess, post_process_mask=True))
        img.save(os.path.join(OUT, f'{sku}.webp'), 'WEBP', quality=84, method=6)
        t = img.copy(); t.thumbnail((THUMB, THUMB), Image.LANCZOS)
        t.save(os.path.join(OUT, f'{sku}.thumb.webp'), 'WEBP', quality=80, method=6)
        print(sku, mode, flush=True)
    json.dump(credits, open(os.path.join(OUT, 'credits.json'), 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    run(json.load(open(sys.argv[1])))
