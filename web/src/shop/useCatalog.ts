import { useEffect, useState } from 'react';
import type { Product } from '../../../worker/src/domain/catalog';
import type { Promotion } from '../../../worker/src/domain/promotions';
import type { Api } from '../lib/api';
import { cacheGet } from '../lib/offline';

export interface Catalog {
  products: Array<Product & { images?: Array<{ key: string; thumb: string }>; featured?: boolean; order?: number; description?: string }>;
  categories: Array<{ id: string; name: string; order: number }>;
  units: Array<{ id: string; name: string }>;
  promotions?: Array<Promotion & { description?: string; terms?: string }>;
  popular?: string[];
  ver?: string;
  at: number;
}

/** الكتالوج من الخادم مع نسخة محلية لكل مستخدم للعمل بلا نت (SRS 17.2): المحل يرى ما يخصه والإدارة ما يخصها. */
export function useCatalog(api: Api) {
  const [cat, setCat] = useState<Catalog | null>(() => (api.scope ? cacheGet<Catalog>(api.scope, '/catalog')?.data ?? null : null));
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let live = true;
    const before = api.scope ? cacheGet<Catalog>(api.scope, '/catalog')?.at : undefined;
    api.get<Catalog>('/catalog').then((c) => {
      if (!live) return;
      // نفس النسخة: لا إعادة رسم لعشرات البطاقات بلا داعٍ
      setCat((prev) => (prev && c.ver && prev.ver === c.ver ? prev : c));
      const after = api.scope ? cacheGet<Catalog>(api.scope, '/catalog')?.at : undefined;
      setOffline(before !== undefined && after === before);
    }).catch(() => live && setOffline(true));
    return () => { live = false; };
  }, [api]);
  return { cat, offline };
}
