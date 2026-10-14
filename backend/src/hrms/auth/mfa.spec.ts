import { randomBytes } from 'node:crypto';
import { base32Decode, base32Encode, decryptSecret, encryptSecret, generateSecret, parseKey, totp, verifyTotp } from './mfa';

describe('mfa', () => {
  it('matches the RFC 6238 SHA-1 test vector', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(totp(secret, 59_000)).toBe('287082');
    expect(totp(secret, 1_111_111_109_000)).toBe('081804');
  });

  it('round-trips base32', () => {
    const bytes = randomBytes(20);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('accepts one step of drift and nothing further', () => {
    const secret = generateSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now - 90_000), now)).toBe(false);
    expect(verifyTotp(secret, 'abcdef', now)).toBe(false);
  });

  it('encrypts and detects tampering', () => {
    const key = parseKey(randomBytes(32).toString('hex'));
    const blob = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(decryptSecret(blob, key)).toBe('JBSWY3DPEHPK3PXP');
    blob[blob.length - 1] ^= 1;
    expect(() => decryptSecret(blob, key)).toThrow();
    expect(() => parseKey('short')).toThrow();
  });
});
