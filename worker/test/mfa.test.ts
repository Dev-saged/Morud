import { describe, expect, it } from 'vitest';
import { authRoutes } from '../src/api/auth';
import { mfaRoutes } from '../src/api/mfa';
import { base32Decode, base32Encode, hotp, step, verifyTotp } from '../src/domain/totp';
import { addUser, world } from './helpers';

const login = (w: ReturnType<typeof world>) => w.call('POST', '/auth/login', { body: { identifier: 'owner', password: 'Secret123' } });

describe('TOTP (RFC 6238)', () => {
  it('يطابق متجهات الاختبار الرسمية ويقبل انحراف خطوة واحدة فقط', async () => {
    const secret = new TextEncoder().encode('12345678901234567890');
    expect(await hotp(secret, 1)).toBe('287082'); // RFC 4226 (6 خانات)
    expect(await hotp(secret, step(59_000))).toBe('287082'); // RFC 6238 عند T=59s
    expect(base32Decode(base32Encode(secret))).toEqual(secret);
    const now = 1_700_000_000_000;
    const code = await hotp(secret, step(now));
    expect(await verifyTotp(secret, code, now + 30_000)).toBe(step(now));
    expect(await verifyTotp(secret, code, now + 90_000)).toBeNull();
    expect(await verifyTotp(secret, code, now, step(now))).toBeNull(); // لا إعادة استخدام
  });
});

describe('التحقق بخطوتين', () => {
  it('تفعيل ← الدخول يطلب الرمز ← رمز صحيح يعطي الجلسة، والتذكرة لمرة واحدة', async () => {
    const w = world([authRoutes, mfaRoutes]);
    addUser(w, 'a1', { username: 'owner', roles: ['super_admin'] });
    const tok = (await login(w)).body.customToken as string;
    expect(tok).toBeTruthy();
    const T1 = w.tokenFor('a1');
    // موقوفة افتراضياً من الإعدادات: لا إعداد ولا ظهور
    expect((await w.call('POST', '/auth/mfa/setup', { token: T1 })).status).toBe(403);
    expect((await w.call('GET', '/auth/me', { token: T1 })).body.user.mfaAvailable).toBe(false);
    w.db.seed('settings/system', { mfaFeature: true });
    expect((await w.call('GET', '/auth/me', { token: T1 })).body.user.mfaAvailable).toBe(true);
    const st = await w.call('POST', '/auth/mfa/setup', { token: T1 });
    expect(st.body.uri).toMatch(/^otpauth:\/\/totp\//);
    const secret = base32Decode(st.body.secret);
    const code = () => hotp(secret, step(w.clock.now));
    expect((await w.call('POST', '/auth/mfa/enable', { token: T1, body: { code: '000000' } })).status).toBe(400);
    expect((await w.call('POST', '/auth/mfa/enable', { token: T1, body: { code: await code() } })).status).toBe(200);
    expect((await w.call('GET', '/auth/me', { token: T1 })).body.user.mfaEnabled).toBe(true);

    w.clock.now += 60_000;
    const first = await login(w);
    expect(first.body).toEqual({ mfaRequired: true, ticket: expect.stringMatching(/^[a-f0-9]{48}$/) });
    expect(first.body.customToken).toBeUndefined();
    const bad = await w.call('POST', '/auth/login/mfa', { body: { ticket: first.body.ticket, code: '123456' } });
    expect(bad.body.error.code).toBe('INVALID_CODE');
    const ok = await w.call('POST', '/auth/login/mfa', { body: { ticket: first.body.ticket, code: await code() } });
    expect(ok.status).toBe(200);
    expect(ok.body.customToken).toContain('custom:a1');
    const again = await w.call('POST', '/auth/login/mfa', { body: { ticket: first.body.ticket, code: await code() } });
    expect(again.body.error.code).toBe('MFA_EXPIRED');
    const audit = (await w.db.query({ collection: 'auditLogs' })).map((a) => a.data.action);
    expect(audit).toContain('auth.mfa.enable');
    // إيقاف الميزة من الإعدادات: الدخول بلا رمز حتى لمن فعّلها، وتشغيلها يعيد طلبه
    w.db.seed('settings/system', { mfaFeature: false });
    expect((await login(w)).body.customToken).toBeTruthy();
    w.db.seed('settings/system', { mfaFeature: true });
    expect((await login(w)).body.mfaRequired).toBe(true);
  });
  it('التذكرة تنتهي بعد 5 دقائق وبعد 5 محاولات خاطئة', async () => {
    const w = world([authRoutes, mfaRoutes]);
    w.db.seed('settings/system', { mfaFeature: true });
    addUser(w, 'a1', { username: 'owner', roles: ['super_admin'] });
    const T1 = w.tokenFor('a1');
    const secret = base32Decode((await w.call('POST', '/auth/mfa/setup', { token: T1 })).body.secret);
    await w.call('POST', '/auth/mfa/enable', { token: T1, body: { code: await hotp(secret, step(w.clock.now)) } });
    w.clock.now += 60_000;
    const t1 = (await login(w)).body.ticket;
    for (let i = 0; i < 5; i++) await w.call('POST', '/auth/login/mfa', { body: { ticket: t1, code: '111111' } });
    expect((await w.call('POST', '/auth/login/mfa', { body: { ticket: t1, code: await hotp(secret, step(w.clock.now)) } })).body.error.code).toBe('MFA_EXPIRED');
    const t2 = (await login(w)).body.ticket;
    w.clock.now += 301_000;
    expect((await w.call('POST', '/auth/login/mfa', { body: { ticket: t2, code: await hotp(secret, step(w.clock.now)) } })).body.error.code).toBe('MFA_EXPIRED');
  });
});
