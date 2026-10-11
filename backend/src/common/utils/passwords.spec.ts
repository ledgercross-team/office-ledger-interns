import { generateTempPassword, hashPassword, sha256Hex, verifyPassword } from './passwords';

describe('passwords', () => {
  describe('hashPassword / verifyPassword', () => {
    it('verifies a correct password', async () => {
      const hash = await hashPassword('S3cret!p@ss');
      await expect(verifyPassword(hash, 'S3cret!p@ss')).resolves.toBe(true);
    });

    it('rejects a wrong password', async () => {
      const hash = await hashPassword('S3cret!p@ss');
      await expect(verifyPassword(hash, 'wrong')).resolves.toBe(false);
    });

    it('returns false for a malformed hash instead of throwing', async () => {
      await expect(verifyPassword('not-a-valid-hash', 'whatever')).resolves.toBe(false);
    });
  });

  describe('generateTempPassword', () => {
    it('returns a non-empty token and distinct values', () => {
      const first = generateTempPassword();
      const second = generateTempPassword();
      expect(first.length).toBeGreaterThan(0);
      expect(first).not.toBe(second);
    });
  });

  describe('sha256Hex', () => {
    it('is deterministic and produces 64 lowercase hex chars', () => {
      const once = sha256Hex('token-value');
      const twice = sha256Hex('token-value');
      expect(once).toBe(twice);
      expect(once).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
