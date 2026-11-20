import { describe, expect, it } from 'vitest';
import { matches, normalizeArabic, searchKeys } from '../src/domain/search';
import { feta } from './fixtures';

describe('البحث العربي (SRS 4.2)', () => {
  it('تطبيع الهمزات والتاء والألف المقصورة والتشكيل والأرقام', () => {
    expect(normalizeArabic('أُرْزٌ مِصْرِيّ')).toBe('ارز مصري');
    expect(normalizeArabic('إسطوانة غاز')).toBe('اسطوانه غاز');
    expect(normalizeArabic('حلوى')).toBe('حلوي');
    expect(normalizeArabic('مؤونة  رئيسية')).toBe('موونه رييسيه');
    expect(normalizeArabic('عصيـــر ١٢٣ ۴')).toBe('عصير 123 4');
    expect(normalizeArabic('Coca-Cola')).toBe('coca cola');
  });
  it('المطابقة بجزء الاسم والاسم البديل والعلامة والرمز والباركود', () => {
    expect(matches('جبن', feta)).toBe(true);
    expect(matches('جبنة فيت', feta)).toBe(true);
    expect(matches('بيضاء', feta)).toBe(true);
    expect(matches('الصافي', feta)).toBe(true);
    expect(matches('dai-001', feta)).toBe(true);
    expect(matches('628100', feta)).toBe(true);
    expect(matches('حليب', feta)).toBe(false);
    expect(matches('   ', feta)).toBe(true);
  });
  it('مفاتيح البحث المخزّنة', () => {
    const k = searchKeys(feta);
    for (const x of ['جب', 'جبنه', 'في', 'فيتا', 'بيضا', 'dai001', '6281000000011']) expect(k).toContain(x);
    expect(searchKeys(feta, 3)).toHaveLength(3);
    expect(searchKeys({ name: '', altNames: [], sku: '', barcodes: [] })).toEqual([]);
  });
});
