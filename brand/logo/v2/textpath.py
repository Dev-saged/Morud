"""تحويل نص عربي/لاتيني إلى مسار SVG مُشكَّل (harfbuzz) لاستخدامه في الشعار بلا خطوط حية."""
import io
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

FONTS = '/home/claude/sajed-brain/video-identity/templates/fonts/'


def _load(name):
    f = TTFont(FONTS + name)
    buf = io.BytesIO()
    f.flavor = None
    f.save(buf)
    return TTFont(io.BytesIO(buf.getvalue())), buf.getvalue()


def text_path(text, font, height, x=0, y=0, anchor='start', tracking=0):
    """يعيد (d, width) — y خط الأساس، height = ارتفاع كتلة الحروف المرسومة."""
    tt, data = _load(font)
    face = hb.Face(data)
    hbfont = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hbfont, buf, {'kern': True, 'liga': True})
    gs = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    # قياس أولي بوحدات الخط
    pen_x = 0
    placed = []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        placed.append((order[info.codepoint], pen_x + pos.x_offset, pos.y_offset))
        pen_x += pos.x_advance + tracking
    bp = BoundsPen(gs)
    for g, gx, gy in placed:
        gs[g].draw(TransformPen(bp, (1, 0, 0, 1, gx, gy)))
    xmin, ymin, xmax, ymax = bp.bounds
    s = height / (ymax - ymin)
    w = (xmax - xmin) * s
    ox = {'start': x, 'middle': x - w / 2, 'end': x - w}[anchor] - xmin * s
    sp = SVGPathPen(gs)
    for g, gx, gy in placed:
        gs[g].draw(TransformPen(sp, (s, 0, 0, -s, ox + gx * s, y + gy * -s + ymin * s)))
    return sp.getCommands(), w
