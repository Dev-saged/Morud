import { useMemo, useState } from 'react';
import { formatMoney } from '../lib/format';
import { toCutoutPng } from '../lib/cutout';
import { useSession } from '../lib/session';
import { Icon } from '../ui/Icons';
import { Field, fromAgorot, Loading, toAgorot, useAction, useLoad } from './kit';

type Unit = { unitId: string; factorToBase: number; price: number; minQtyMilli: number; stepMilli: number; allowFraction: boolean };
type Product = { id: string; name: string; sku: string; categoryId: string; baseUnitId: string; units: Unit[]; available: boolean; visible: boolean; images?: Array<{ key: string; thumb: string }>; altNames: string[]; barcodes: string[]; brand?: string; description?: string };
type Catalog = { products: Product[]; categories: Array<{ id: string; name: string; order: number }>; units: Array<{ id: string; name: string; kind?: string }> };

export function Products() {
  const { api, can } = useSession();
  const { data, error, reload } = useLoad<Catalog>('/catalog');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Product | 'new' | null>(null);
  const [tab, setTab] = useState<'products' | 'categories' | 'units'>('products');
  const act = useAction();
  const list = useMemo(() => (data?.products ?? []).filter((p) => !q || p.name.includes(q) || p.sku.includes(q.toUpperCase())), [data, q]);
  if (!data) return <Loading error={error} />;
  if (edit) return <ProductForm catalog={data} product={edit === 'new' ? null : edit} done={() => { setEdit(null); void reload(); }} />;
  const cat = new Map(data.categories.map((c) => [c.id, c.name]));
  return (
    <section>
      <h1>المنتجات والتصنيفات</h1>
      <div className="chips">{([['products', 'المنتجات'], ['categories', 'التصنيفات'], ['units', 'الوحدات']] as const).map(([t, l]) => <button key={t} className={tab === t ? 'chip on' : 'chip'} onClick={() => setTab(t)}>{l}</button>)}</div>
      {tab === 'products' && <>
        <div className="row"><div className="search" style={{ flex: 1 }}><Icon name="search" /><input aria-label="بحث المنتجات" placeholder="الاسم أو الرمز" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {can('products.create') && <button className="btn primary" onClick={() => setEdit('new')}>منتج جديد</button>}</div>
        {act.view}
        <table className="table"><thead><tr><th></th><th>المنتج</th><th>الرمز</th><th>التصنيف</th><th>السعر</th><th>الحالة</th><th></th></tr></thead>
          <tbody>{list.map((p) => <tr key={p.id}>
            <td>{p.images?.[0] ? <img src={`${api.base}/files/${p.images[0].thumb}`} alt="" width={40} height={40} style={{ objectFit: 'contain' }} /> : null}</td>
            <td>{p.name}</td><td className="num">{p.sku}</td><td>{cat.get(p.categoryId)}</td><td className="num">{formatMoney(p.units[0]!.price)}</td>
            <td>{can('products.availability.update') ? <button className={`chip ${p.available ? 'tone-success' : 'tone-danger'}`} onClick={() => void act.run(() => api.patch(`/admin/products/${p.id}`, { available: !p.available }).then(reload), 'تم تحديث التوفر')}>{p.available ? 'متوفر' : 'غير متوفر'}</button> : (p.available ? 'متوفر' : 'غير متوفر')}{!p.visible && <span className="chip">مخفي</span>}</td>
            <td>{can('products.update') && <button className="link" onClick={() => setEdit(p)}>تعديل</button>}</td></tr>)}</tbody></table>
        {list.length === 0 && <p className="empty">لا منتجات.</p>}
      </>}
      {tab === 'categories' && <Categories catalog={data} reload={reload} />}
      {tab === 'units' && <Units catalog={data} reload={reload} />}
    </section>
  );
}

function ProductForm({ catalog, product, done }: { catalog: Catalog; product: Product | null; done: () => void }) {
  const { api, can } = useSession();
  const act = useAction();
  const [f, setF] = useState(() => ({
    name: product?.name ?? '', sku: product?.sku ?? '', categoryId: product?.categoryId ?? catalog.categories[0]?.id ?? '', brand: product?.brand ?? '', description: product?.description ?? '',
    altNames: (product?.altNames ?? []).join('، '), barcodes: (product?.barcodes ?? []).join('، '), available: product?.available ?? true, visible: product?.visible ?? true,
    baseUnitId: product?.baseUnitId ?? catalog.units[0]?.id ?? '',
    units: (product?.units ?? [{ unitId: catalog.units[0]?.id ?? '', factorToBase: 1000, price: 0, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false }]).map((u) => ({ ...u, priceText: product ? fromAgorot(u.price) : '', factor: String(u.factorToBase / 1000) })),
    images: product?.images ?? [], cost: '',
  }));
  const [preview, setPreview] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const setUnit = (i: number, k: string, v: unknown) => setF((s) => ({ ...s, units: s.units.map((u, j) => (j === i ? { ...u, [k]: v } : u)) }));
  const list = (v: string) => v.split(/[،,]/).map((x) => x.trim()).filter(Boolean);

  const upload = async (file: File) => {
    await act.run(async () => {
      const { blob, removedRatio } = await toCutoutPng(file);
      setPreview(URL.createObjectURL(blob));
      const r = await api.upload<{ key: string }>('/admin/uploads/product-image', blob);
      setF((s) => ({ ...s, images: [...s.images, { key: r.key, thumb: r.key }] }));
      if (removedRatio === 0) act.setMsg({ ok: true, text: 'الصورة مفرّغة أصلاً وتم رفعها' });
    }, 'تم تفريغ الصورة ورفعها، تظهر للجميع بعد الحفظ');
  };

  const save = () => act.run(async () => {
    const units = f.units.map((u) => {
      const price = toAgorot(u.priceText);
      if (!Number.isSafeInteger(price)) throw new Error(`سعر غير صالح للوحدة ${u.unitId}`);
      return { unitId: u.unitId, factorToBase: Math.round(Number(u.factor) * 1000), price, minQtyMilli: u.minQtyMilli, stepMilli: u.stepMilli, allowFraction: u.allowFraction };
    });
    const body: Record<string, unknown> = { name: f.name, sku: f.sku, categoryId: f.categoryId, baseUnitId: f.baseUnitId, units, brand: f.brand || undefined, description: f.description, altNames: list(f.altNames), barcodes: list(f.barcodes), available: f.available, visible: f.visible, images: f.images };
    if (f.cost && can('products.cost.view')) body.cost = toAgorot(f.cost);
    if (product) await api.patch(`/admin/products/${product.id}`, body); else await api.post('/admin/products', body, crypto.randomUUID().replace(/-/g, ''));
    done();
  });

  return (
    <div className="card">
      <button className="link" onClick={done}><Icon name="chevron" flip /> المنتجات</button>
      <h2>{product ? `تعديل: ${product.name}` : 'منتج جديد'}</h2>
      <div className="two">
        <div>
          <Field label="اسم المنتج"><input value={f.name} onChange={(e) => set('name', e.target.value)} required /></Field>
          <Field label="الرمز (SKU)"><input value={f.sku} onChange={(e) => set('sku', e.target.value)} dir="ltr" /></Field>
          <Field label="التصنيف"><select value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>{catalog.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="العلامة التجارية"><input value={f.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
          <Field label="أسماء بديلة للبحث (افصل بفاصلة)"><input value={f.altNames} onChange={(e) => set('altNames', e.target.value)} /></Field>
          <Field label="الباركود"><input value={f.barcodes} onChange={(e) => set('barcodes', e.target.value)} dir="ltr" /></Field>
          <Field label="الوصف"><textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
          {can('products.cost.view') && <Field label="التكلفة (₪) — لا تظهر للمحلات"><input inputMode="decimal" value={f.cost} onChange={(e) => set('cost', e.target.value)} /></Field>}
          <div className="row"><label className="row"><input type="checkbox" checked={f.available} onChange={(e) => set('available', e.target.checked)} style={{ width: 'auto' }} />متوفر</label><label className="row"><input type="checkbox" checked={f.visible} onChange={(e) => set('visible', e.target.checked)} style={{ width: 'auto' }} />ظاهر للمحلات</label></div>
        </div>
        <div>
          <h3>الصور (تُفرَّغ تلقائياً)</h3>
          <div className="row">{f.images.map((im, i) => <div key={im.key} className="shelf" style={{ width: 96 }}><img src={`${api.base}/files/${im.thumb}`} alt="" /><button className="link" onClick={() => set('images', f.images.filter((_, j) => j !== i))}>إزالة</button></div>)}
            {preview && <div className="shelf" style={{ width: 96 }}><img src={preview} alt="معاينة التفريغ" /></div>}</div>
          <Field label="رفع صورة"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }} /></Field>
          <h3>وحدات البيع</h3>
          <Field label="الوحدة الأساسية"><select value={f.baseUnitId} onChange={(e) => set('baseUnitId', e.target.value)}>{catalog.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          {f.units.map((u, i) => <div key={i} className="card" style={{ marginBottom: 8 }}>
            <div className="row">
              <Field label="الوحدة"><select value={u.unitId} onChange={(e) => setUnit(i, 'unitId', e.target.value)}>{catalog.units.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
              <Field label="تساوي من الأساسية"><input inputMode="decimal" value={u.factor} onChange={(e) => setUnit(i, 'factor', e.target.value)} /></Field>
              <Field label="السعر (₪)"><input inputMode="decimal" value={u.priceText} onChange={(e) => setUnit(i, 'priceText', e.target.value)} /></Field>
            </div>
            {f.units.length > 1 && <button className="link" onClick={() => set('units', f.units.filter((_, j) => j !== i))}>حذف الوحدة</button>}
          </div>)}
          {f.units.length < 10 && <button className="btn ghost" onClick={() => set('units', [...f.units, { unitId: catalog.units[0]?.id ?? '', factorToBase: 1000, price: 0, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false, priceText: '', factor: '1' }])}>إضافة وحدة</button>}
        </div>
      </div>
      {act.view}
      <div className="actions"><button className="btn primary" disabled={act.busy} onClick={() => void save()}>حفظ المنتج</button>
        {product && can('products.delete') && <button className="btn danger" onClick={() => void act.run(() => api.del(`/admin/products/${product.id}`).then(done))}>أرشفة</button>}</div>
    </div>
  );
}

function Categories({ catalog, reload }: { catalog: Catalog; reload: () => Promise<void> }) {
  const { api, can } = useSession();
  const act = useAction();
  const [name, setName] = useState('');
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  if (!can('categories.manage')) return <ul className="plain">{catalog.categories.map((c) => <li key={c.id}>{c.name}</li>)}</ul>;
  return (
    <div className="card">
      <form className="row" onSubmit={(e) => { e.preventDefault(); void act.run(() => api.post('/admin/categories', { name, order: catalog.categories.length + 1 }).then(() => { setName(''); return reload(); }), 'أضيف التصنيف'); }}>
        <input aria-label="اسم التصنيف" placeholder="تصنيف جديد" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, width: 'auto' }} /><button className="btn primary">إضافة</button></form>
      {act.view}
      <ul className="plain">{catalog.categories.map((c) => <li key={c.id} className="row">{rename?.id === c.id
          ? <form className="row" style={{ flex: 1 }} onSubmit={(e) => { e.preventDefault(); void act.run(() => api.patch(`/admin/categories/${c.id}`, { name: rename.name }).then(() => { setRename(null); return reload(); })); }}><input aria-label="الاسم الجديد" value={rename.name} onChange={(e) => setRename({ id: c.id, name: e.target.value })} style={{ flex: 1, width: 'auto' }} /><button className="btn">حفظ</button></form>
          : <><span style={{ flex: 1 }}>{c.name}</span><button className="link" onClick={() => setRename({ id: c.id, name: c.name })}>تسمية</button></>}
        <button className="link danger-text" onClick={() => void act.run(() => api.del(`/admin/categories/${c.id}`).then(reload), 'حُذف التصنيف')}>حذف</button></li>)}</ul>
    </div>
  );
}

function Units({ catalog, reload }: { catalog: Catalog; reload: () => Promise<void> }) {
  const { api, can } = useSession();
  const act = useAction();
  const [f, setF] = useState({ id: '', name: '', kind: 'count' });
  if (!can('units.manage')) return <ul className="plain">{catalog.units.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
  return (
    <div className="card">
      <form className="row" onSubmit={(e) => { e.preventDefault(); void act.run(() => api.put(`/admin/units/${f.id}`, { name: f.name, kind: f.kind, allowFraction: f.kind !== 'count' }).then(() => { setF({ id: '', name: '', kind: 'count' }); return reload(); }), 'حُفظت الوحدة'); }}>
        <input aria-label="معرّف الوحدة" placeholder="المعرّف (لاتيني)" dir="ltr" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} style={{ width: 160 }} />
        <input aria-label="اسم الوحدة" placeholder="الاسم" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ width: 160 }} />
        <select aria-label="نوع الوحدة" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} style={{ width: 140 }}><option value="count">عدد</option><option value="weight">وزن</option><option value="volume">حجم</option></select>
        <button className="btn primary">حفظ</button></form>
      {act.view}
      <ul className="plain">{catalog.units.map((u) => <li key={u.id} className="row"><span style={{ flex: 1 }}>{u.name} <small className="mute num">{u.id}</small></span><button className="link danger-text" onClick={() => void act.run(() => api.del(`/admin/units/${u.id}`).then(reload), 'حُذفت الوحدة')}>حذف</button></li>)}</ul>
    </div>
  );
}
