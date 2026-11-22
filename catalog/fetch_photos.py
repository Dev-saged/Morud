"""جمع صور حقيقية مرشحة لكل منتج من ويكيميديا كومنز وOpen Food Facts مع الرخصة والمؤلف (للإسناد الإلزامي)."""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from photo_queries import Q

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

def off(q, n=3):
    s = get('https://world.openfoodfacts.org/cgi/search.pl?' + urllib.parse.urlencode({'search_terms': q, 'json': 1, 'page_size': 12, 'fields': 'code,product_name,image_front_url'}))
    out = []
    for p in s.get('products', []):
        u = p.get('image_front_url')
        if not u: continue
        out.append({'src': 'off', 'title': p.get('product_name', ''), 'thumb': u.replace('.400.jpg', '.full.jpg'), 'thumbSmall': u, 'page': f"https://world.openfoodfacts.org/product/{p['code']}", 'license': 'CC BY-SA 3.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-sa/3.0/', 'author': 'Open Food Facts contributors'})
        if len(out) >= n: break
    return out

def one(sku):
    d = os.path.join(OUT, sku)
    mp = os.path.join(d, 'meta.json')
    if os.path.exists(mp) and len(json.load(open(mp))) >= 3: return sku, 'cached'
    os.makedirs(d, exist_ok=True)
    cands = []
    for q in Q[sku].get('o', []):
        try: cands += off(q)
        except Exception as e: print(sku, 'off', e, file=sys.stderr)
    for q in Q[sku].get('c', []):
        try: cands += commons(q, 3 if cands else 4)
        except Exception as e: print(sku, 'commons', e, file=sys.stderr)
        time.sleep(2.5)
    seen, keep = set(), []
    for c in cands:
        if c['thumb'] in seen: continue
        seen.add(c['thumb'])
        try:
            b = get(c['thumb'], binary=True)
        except Exception:
            try: b = get(c.get('thumbSmall', ''), binary=True) if c.get('thumbSmall') else None
            except Exception: b = None
        if not b or len(b) < 8000: continue
        c['file'] = f'{len(keep)}.jpg'
        open(os.path.join(d, c['file']), 'wb').write(b)
        keep.append(c)
        if len(keep) >= 6: break
    json.dump(keep, open(os.path.join(d, 'meta.json'), 'w'), ensure_ascii=False, indent=1)
    return sku, len(keep)

if __name__ == '__main__':
    skus = sys.argv[1:] or list(Q)
    with ThreadPoolExecutor(1) as ex:
        for sku, n in ex.map(one, skus): print(sku, n, flush=True)
