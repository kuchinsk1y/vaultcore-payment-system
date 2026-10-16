import { describe, it, expect } from 'vitest';
import { decryptSecret, encryptSecret } from '../../src/modules/security/secret-box';
import { isLocked, registerFailure } from '../../src/modules/security/lockout';
import { generateNumericCode, generateToken, hashToken, safeEqual } from '../../src/modules/security/tokens';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  totpStep,
  verifyTotp,
} from '../../src/modules/security/totp';
import { hashTransferRequest } from '../../src/modules/transfers/transfer-confirmation.service';

// RFC 6238 test secret "12345678901234567890" (ASCII), base32 encoded
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('base32', () => {
  it('round-trips arbitrary bytes and matches the RFC secret', () => {
    expect(base32Encode(Buffer.from('12345678901234567890'))).toBe(RFC_SECRET);
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890');

    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('rejects invalid characters', () => {
    expect(() => base32Decode('not*base32')).toThrow();
  });
});

describe('TOTP (RFC 6238 test vectors, last 6 digits)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('produces the expected code at t=%i', (seconds, expected) => {
    expect(hotp(RFC_SECRET, totpStep(seconds * 1000))).toBe(expected);
  });

  it('accepts the current code and one step of clock drift, but not further', () => {
    const now = 1234567890 * 1000;
    const current = hotp(RFC_SECRET, totpStep(now));
    const previous = hotp(RFC_SECRET, totpStep(now) - 1);
    const stale = hotp(RFC_SECRET, totpStep(now) - 3);

    expect(verifyTotp(RFC_SECRET, current, { now })).toBe(totpStep(now));
    expect(verifyTotp(RFC_SECRET, previous, { now })).toBe(totpStep(now) - 1);
    expect(verifyTotp(RFC_SECRET, stale, { now })).toBeNull();
  });

  it('rejects malformed codes', () => {
    expect(verifyTotp(RFC_SECRET, '12345')).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBeNull();
    expect(verifyTotp(RFC_SECRET, '')).toBeNull();
  });

  it('rejects a replayed code (step not newer than the last used one)', () => {
    const now = 1234567890 * 1000;
    const code = hotp(RFC_SECRET, totpStep(now));
    const step = verifyTotp(RFC_SECRET, code, { now });

    expect(step).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, code, { now, lastUsedStep: step })).toBeNull();
  });

  it('generates a usable random secret and a valid otpauth URI', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);

    const uri = new URL(otpauthUri(secret, 'ada@example.com', 'PayCore'));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.searchParams.get('secret')).toBe(secret);
    expect(uri.searchParams.get('issuer')).toBe('PayCore');
    expect(decodeURIComponent(uri.pathname)).toContain('ada@example.com');
  });
});

describe('tokens', () => {
  it('generates unique, URL-safe tokens and stable hashes', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates zero-padded numeric codes', () => {
    for (let i = 0; i < 50; i++) expect(generateNumericCode(6)).toMatch(/^\d{6}$/);
  });

  it('compares strings without throwing on length mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('secret box', () => {
  it('round-trips and uses a fresh IV every time', () => {
    const a = encryptSecret('JBSWY3DPEHPK3PXP');
    const b = encryptSecret('JBSWY3DPEHPK3PXP');

    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('detects tampering', () => {
    const [iv, tag, data] = encryptSecret('secret').split('.');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 1;
    expect(() => decryptSecret([iv, tag, flipped.toString('base64')].join('.'))).toThrow();
  });
});

describe('lockout policy', () => {
  const policy = { maxAttempts: 3, lockMinutes: 15 };
  const now = new Date('2026-01-01T12:00:00Z');

  it('counts failures and locks on reaching the limit', () => {
    let state = { attempts: 0, lockedUntil: null as Date | null };

    state = registerFailure(state, policy, now);
    state = registerFailure(state, policy, now);
    expect(state).toEqual({ attempts: 2, lockedUntil: null });

    state = registerFailure(state, policy, now);
    expect(state.attempts).toBe(3);
    expect(state.lockedUntil?.toISOString()).toBe('2026-01-01T12:15:00.000Z');
  });

  it('reports whether a lock is still active', () => {
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(new Date('2026-01-01T12:00:01Z'), now)).toBe(true);
    expect(isLocked(new Date('2026-01-01T11:59:59Z'), now)).toBe(false);
  });

  it('starts a fresh window after a lock has expired', () => {
    const expired = { attempts: 3, lockedUntil: new Date('2026-01-01T11:00:00Z') };
    expect(registerFailure(expired, policy, now)).toEqual({ attempts: 1, lockedUntil: null });
  });
});

describe('hashTransferRequest', () => {
  const base = {
    userId: 'u1',
    sourceAccountId: 'a',
    destinationAccountId: 'b',
    amount: 500_000,
    currency: 'EUR',
  };

  it('is deterministic and sensitive to every transfer detail', () => {
    expect(hashTransferRequest(base)).toBe(hashTransferRequest({ ...base }));

    for (const change of [
      { userId: 'u2' },
      { sourceAccountId: 'x' },
      { destinationAccountId: 'x' },
      { amount: 500_001 },
      { currency: 'USD' },
    ]) {
      expect(hashTransferRequest({ ...base, ...change })).not.toBe(hashTransferRequest(base));
    }
  });
});
