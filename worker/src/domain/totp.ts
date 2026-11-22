// رموز TOTP (RFC 6238) بـ WebCrypto: نفس ما تولّده تطبيقات المصادقة (Google/Microsoft Authenticator)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(b: Uint8Array): string {
  let bits = 0, val = 0, out = '';
  for (const x of b) { val = (val << 8) | x; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0; const out: number[] = [];
  for (const c of clean) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}

export async function hotp(secret: Uint8Array, counter: number, digits = 6): Promise<string> {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const key = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[h.length - 1]! & 15;
  const bin = ((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const step = (nowMs: number, period = 30) => Math.floor(nowMs / 1000 / period);

/** يقبل الخطوة الحالية ±1 (انحراف ساعة الهاتف)، ويرجع رقم الخطوة المطابقة لمنع إعادة استخدام الرمز. */
export async function verifyTotp(secret: Uint8Array, code: string, nowMs: number, lastStep = -1): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const now = step(nowMs);
  for (const s of [now, now - 1, now + 1]) {
    if (s <= lastStep) continue;
    if ((await hotp(secret, s)) === code) return s;
  }
  return null;
}

export function otpauthUri(secretB32: string, account: string, issuer = 'Mawred') {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
