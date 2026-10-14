import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 6238: HMAC-SHA1, 30 second steps, 6 digits. */
export function totp(secret: string, atMs: number): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code =
    (((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]) %
    10 ** DIGITS;
  return String(code).padStart(DIGITS, '0');
}

/** Accepts the current step and one either side, for clock drift. */
export function verifyTotp(secret: string, code: string, atMs: number = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  let ok = false;
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(totp(secret, atMs + drift * STEP_SECONDS * 1000));
    if (timingSafeEqual(expected, Buffer.from(code))) ok = true;
  }
  return ok;
}

export function otpauthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`office-ledger:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=office-ledger&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/** The key is 32 bytes, given as 64 hex characters or base64. */
export function parseKey(raw: string): Buffer {
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64).');
  return key;
}

/** AES-256-GCM. Stored as iv(12) | tag(16) | ciphertext. */
export function encryptSecret(secret: string, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptSecret(blob: Buffer, key: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8');
}
