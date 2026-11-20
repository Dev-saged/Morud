import { describe, expect, it } from 'vitest';
import { cleanText } from '../src/api/http';
import { loginKey, passwordProblem, ruleClaims } from '../src/domain/permissions';

describe('أدوات الصلاحيات والدخول', () => {
  it('توحيد معرّف الدخول', () => {
    expect(loginKey(' Ahmed@Mawred.PS ')).toBe('e:ahmed@mawred.ps');
    expect(loginKey('bad@')).toBeNull();
    expect(loginKey('0599123456')).toBe('p:0599123456');
    expect(loginKey('+972 59 912 3456')).toBe('p:0599123456');
    expect(loginKey('00970599123456')).toBe('p:0599123456');
    expect(loginKey('٠٥٩٩١٢٣٤٥٦')).toBe('p:0599123456');
    expect(loginKey('123456789012345')).toBeNull();
    expect(loginKey('Abu_Ali.2')).toBe('u:abu_ali.2');
    expect(loginKey('ab')).toBeNull();
    expect(loginKey('')).toBeNull();
    expect(loginKey('x'.repeat(121))).toBeNull();
  });
  it('سياسة كلمة المرور', () => {
    expect(passwordProblem('abc123')).toBe('PASSWORD_TOO_SHORT');
    expect(passwordProblem('a1'.repeat(65))).toBe('PASSWORD_TOO_LONG');
    expect(passwordProblem('12345678')).toBe('PASSWORD_WEAK');
    expect(passwordProblem('كلمةسر2026')).toBeNull();
  });
  it('claims مختصرة ومحدودة الحجم', () => {
    const c = ruleClaims(new Set(['orders.view', 'shop.statement.view', 'products.create']), new Set(['staff', 'shop']), Array.from({ length: 30 }, (_, i) => `s${i}`));
    expect(c).toEqual({ rp: ['ov', 'ss'], k: ['shop', 'staff'], sh: expect.any(Array) });
    expect(c.sh).toHaveLength(20);
    expect(JSON.stringify(c).length).toBeLessThan(1000);
  });
  it('تنظيف النص', () => {
    expect(cleanText(' اسم\u0007 ', 10, 'x')).toBe('اسم');
    expect(cleanText(undefined, 10, 'x', false)).toBe('');
    expect(() => cleanText('   ', 10, 'x')).toThrow();
    expect(() => cleanText('', 10, 'x')).toThrow();
    expect(() => cleanText('long text', 3, 'x')).toThrow();
  });
});
