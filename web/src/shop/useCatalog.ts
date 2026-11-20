import { useEffect, useState } from 'react';
import type { Product } from '../../../worker/src/domain/catalog';
import type { Api } from '../lib/api';

export interface Catalog {
  products: Array<Product & { images?: Array<{ key: string; thumb: string }>; featured?: boolean; order?: number; description?: string }>;
  categories: Array<{ id: string; name: string; order: number }>;
  units: Array<{ id: string; name: string }>;
  at: number;
}
const KEY = 'mawred.catalog.v1';

/** الكتالوج من الخادم مع نسخة محلية للعمل بلا نت (SRS 17.2). */
export function useCatalog(api: Api) {
  const [cat, setCat] = useState<Catalog | null>(() => { try { const r = localStorage.getItem(KEY); return r ? (JSON.parse(r) as Catalog) : null; } catch { return null; } });
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let live = true;
    api.get<Catalog>('/catalog').then((c) => {
      if (!live) return;
      setCat(c);
      setOffline(false);
      try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* لا تخزين */ }
    }).catch(() => live && setOffline(true));
    return () => { live = false; };
  }, [api]);
  return { cat, offline };
}
