"""جمع صور حقيقية مرشحة لكل منتج من ويكيميديا كومنز وOpen Food Facts مع الرخصة والمؤلف (للإسناد الإلزامي)."""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from photo_queries import Q
from photo_queries_extra import X
from photo_queries_retry import R
HOSTS = {'o': ('world.openfoodfacts.org', 'Open Food Facts'), 'b': ('world.openbeautyfacts.org', 'Open Beauty Facts'), 'p': ('world.openproductsfacts.org', 'Open Products Facts')}

UA = 'MawredCatalogBot/1.0 (https://github.com/Dev-saged/Morud)'
OUT = os.path.join(os.path.dirname(__file__), 'photos', 'cand')
OK_LIC = re.compile(r'^(cc0|public domain|pd|cc by(-sa)? ?[1-4]\.0.*|cc by(-sa)?$|cc-by.*)', re.I)

def get(url, binary=False, tries=6):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=40) as r:
                b = r.read()
                return b if binary else json.loads(b)
        except urllib.error.HTTPError as e:
            if i == tries - 1: raise
            # 429: احترم مهلة الخادم (ويكيميديا تحدّ المعدّل بشدة)
            time.sleep(int(e.headers.get('Retry-After') or 0) or (25 + 20 * i) if e.code == 429 else 2 + 3 * i)
        except Exception:
            if i == tries - 1: raise
            time.sleep(2 + 3 * i)

def strip(html):
    return re.sub(r'<[^>]+>', '', html or '').strip()[:120]

def commons(q, n=4):
    s = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'generator': 'search', 'gsrsearch': f'{q} filetype:bitmap', 'gsrnamespace': 6, 'gsrlimit': 12,
        'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata|mime', 'iiurlwidth': 900}))
    out = []
    for p in sorted((s.get('query') or {}).get('pages', {}).values(), key=lambda p: p.get('index', 99)):
        ii = (p.get('imageinfo') or [{}])[0]
        md = ii.get('extmetadata', {})
        lic = (md.get('LicenseShortName') or {}).get('value', '')
        if ii.get('mime') not in ('image/jpeg', 'image/png') or ii.get('width', 0) < 500 or not OK_LIC.match(lic.strip()): continue
        out.append({'src': 'commons', 'title': p['title'], 'thumb': ii.get('thumburl'), 'page': ii.get('descriptionurl'), 'license': lic, 'licenseUrl': (md.get('LicenseUrl') or {}).get('value', ''), 'author': strip((md.get('Artist') or {}).get('value', ''))})
        if len(out) >= n: break
    return out

def off(q, n=3, kind='o'):
    host, name = HOSTS[kind]
    s = get(f'https://{host}/cgi/search.pl?' + urllib.parse.urlencode({'search_terms': q, 'json': 1, 'page_size': 12, 'fields': 'code,product_name,image_front_url'}))
    out = []
    for p in s.get('products', []):
        u = p.get('image_front_url')
        if not u: continue
        out.append({'src': 'off', 'title': p.get('product_name', ''), 'thumb': u.replace('.400.jpg', '.full.jpg'), 'thumbSmall': u, 'page': f"https://{host}/product/{p['code']}", 'license': 'CC BY-SA 3.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-sa/3.0/', 'author': f'{name} contributors'})
        if len(out) >= n: break
    return out

def one(sku, mode='all'):
    d = os.path.join(OUT, sku)
    os.makedirs(d, exist_ok=True)
    mp = os.path.join(d, 'meta.json')
    keep = json.load(open(mp)) if os.path.exists(mp) else []
    if len(keep) >= (16 if mode == 'retry' else 8): return sku, len(keep)
    cands = []
    if mode == 'retry':
        for q in R.get(sku, {}).get('o', []):
            try: cands += off(q, 4, 'o')
            except Exception as e: print(sku, 'off', e, file=sys.stderr)
        for q in R.get(sku, {}).get('c', []):
            try: cands += commons(q, 4)
            except Exception as e: print(sku, 'commons', e, file=sys.stderr)
            time.sleep(2.5)
    if mode in ('all', 'off'):
        for kind in ('o', 'b', 'p'):
            for q in Q[sku].get(kind, []) + X.get(sku, {}).get(kind, []):
                try: cands += off(q, 3, kind)
                except Exception as e: print(sku, kind, e, file=sys.stderr)
    if mode in ('all', 'commons'):
        for q in Q[sku].get('c', []):
            try: cands += commons(q, 4)
            except Exception as e: print(sku, 'commons', e, file=sys.stderr)
            time.sleep(2.5)
    seen = {c['thumb'] for c in keep}
    for c in cands:
        if c['thumb'] in seen or len(keep) >= (16 if mode == 'retry' else 8): continue
        seen.add(c['thumb'])
        b = None
        for u in (c['thumb'], c.get('thumbSmall')):
            if not u: continue
            try: b = get(u, binary=True); break
            except Exception: pass
        if not b or len(b) < 8000: continue
        c['file'] = f'{len(keep)}.jpg'
        open(os.path.join(d, c['file']), 'wb').write(b)
        keep.append(c)
    json.dump(keep, open(mp, 'w'), ensure_ascii=False, indent=1)
    return sku, len(keep)

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in ('all', 'off', 'commons', 'retry') else 'all'
    skus = [a for a in sys.argv[1:] if a not in ('all', 'off', 'commons', 'retry')] or (list(R) if mode == 'retry' else list(Q))
    with ThreadPoolExecutor(3 if mode == 'off' else 1) as ex:
        for sku, n in ex.map(lambda k: one(k, mode), skus): print(sku, n, flush=True)
