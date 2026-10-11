import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { sha256Hex } from '../common/utils/passwords';
import { refreshTokens } from '../db/schema/refresh-tokens';
import { users } from '../db/schema/users';
import { createFakeDatabase } from '../test-support/fake-db';
import { AuthStateService } from './auth-state.service';
import { ACCESS_COOKIE, REFRESH_COOKIE, type LoginUser } from './auth.types';
import { TokenService } from './token.service';

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string | undefined> = {
    JWT_ACCESS_SECRET: 'jwt-secret',
    JWT_ACCESS_TTL_SECONDS: '900',
    REFRESH_TOKEN_TTL_DAYS: '7',
    COOKIE_SECURE: 'false',
    COOKIE_DOMAIN: '',
    ...overrides,
  };

  return {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`Missing config: ${key}`);
      }
      return value;
    }),
  } as unknown as ConfigService;
}

function makeService(config: Parameters<typeof createFakeDatabase>[0]) {
  const database = createFakeDatabase(config);
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('access-token-123'),
  } as unknown as JwtService;
  const authState = { invalidate: jest.fn() } as unknown as AuthStateService;

  const service = new TokenService(jwtService, makeConfig(), database as any, authState);

  return { service, database, jwtService, authState };
}

function makeReq(cookies: Record<string, string> = {}) {
  return {
    ip: '203.0.113.9',
    path: '/api/v1/auth/refresh',
    method: 'POST',
    headers: { 'user-agent': 'jest' },
    cookies,
  };
}

const COOKIE_OPTS = expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' });

function makeRes() {
  const response: Record<string, any> = {};
  response.cookie = jest.fn((name: string, value: string) => {
    response.sent[name] = value;
  });
  response.clearCookie = jest.fn((name: string) => {
    delete response.sent[name];
  });
  response.sent = {};
  return response as unknown as Response & { sent: Record<string, string>; clearCookie: jest.Mock };
}

const baseUser: LoginUser = {
  id: 'u1',
  role: 'manager',
  companyId: 'c1',
  fullName: 'Alice',
  email: 'alice@example.com',
  mustChangePassword: false,
  tokenVersion: 0,
};

const future = () => new Date(Date.now() + 60_000);
const revokedAt = (msAgo: number) => new Date(Date.now() - msAgo);

describe('TokenService', () => {
  describe('issueTokens', () => {
    it('stores only a hash of the refresh token and sets both cookies', async () => {
      const { service, database } = makeService({ companies: [] });
      const req = makeReq();
      const res = makeRes();

      await service.issueTokens(baseUser, req as any, res);

      const insert = database.inserts[0];
      expect(insert.table).toBe(refreshTokens);
      const values = insert.values as Record<string, string>;
      expect(values.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(values.tokenHash).not.toBe('');

      const rawRefresh = res.sent[REFRESH_COOKIE];
      expect(rawRefresh).toBeDefined();
      expect(values.tokenHash).toBe(sha256Hex(rawRefresh));
      expect(res.sent[ACCESS_COOKIE]).toBe('access-token-123');
      // oxlint-disable-next-line typescript/unbound-method
      expect(res.cookie).toHaveBeenCalledTimes(2);
    });

    it('uses httpOnly, sameSite lax cookies', async () => {
      const { service } = makeService({ companies: [] });
      const req = makeReq();
      const res = makeRes();

      await service.issueTokens(baseUser, req as any, res);

      for (const call of (res.cookie as jest.Mock).mock.calls) {
        expect(call[2].httpOnly).toBe(true);
        expect(call[2].sameSite).toBe('lax');
        expect(call[2].secure).toBe(false);
      }
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and issues a fresh access token', async () => {
      const oldHash = sha256Hex('refresh-token-old');
      const { service, database } = makeService({
        refreshTokens: [
          { id: 'r1', userId: 'u1', tokenHash: oldHash, expiresAt: future(), revokedAt: null },
        ],
        users: [{ id: 'u1', role: 'manager', companyId: 'c1', isActive: true, tokenVersion: 0 }],
        companies: [{ id: 'c1', isActive: true }],
      });
      const req = makeReq({ [REFRESH_COOKIE]: 'refresh-token-old' });
      const res = makeRes();

      await service.refresh(req as any, res);

      expect(res.sent[REFRESH_COOKIE]).toBeDefined();
      expect(res.sent[REFRESH_COOKIE]).not.toBe('refresh-token-old');
      expect(res.sent[ACCESS_COOKIE]).toBe('access-token-123');
      expect(database.inserts).toHaveLength(1);
      expect(database.updates).toHaveLength(1);
      expect((database.updates[0] as any).table).toBe(refreshTokens);
      expect((database.updates[0] as any).set.replacedById).toBe('inserted-id');
    });

    it('rejects an unknown refresh token and clears cookies', async () => {
      const { service } = makeService({ refreshTokens: [], users: [], companies: [] });
      const req = makeReq({ [REFRESH_COOKIE]: 'unknown-token' });
      const res = makeRes();

      await expect(service.refresh(req as any, res)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(res.clearCookie).toHaveBeenCalledWith(ACCESS_COOKIE, COOKIE_OPTS);
      expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, COOKIE_OPTS);
    });

    it('rejects an expired refresh token', async () => {
      const oldHash = sha256Hex('refresh-token-expired');
      const { service } = makeService({
        refreshTokens: [
          {
            id: 'r1',
            userId: 'u1',
            tokenHash: oldHash,
            expiresAt: new Date(Date.now() - 60_000),
            revokedAt: null,
          },
        ],
        users: [{ id: 'u1', isActive: true }],
        companies: [],
      });
      const req = makeReq({ [REFRESH_COOKIE]: 'refresh-token-expired' });
      const res = makeRes();

      await expect(service.refresh(req as any, res)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, COOKIE_OPTS);
    });

    it('tolerates a just-rotated token (two-tab refresh) without punitive invalidation', async () => {
      const oldHash = sha256Hex('refresh-token-old');
      const { service, database } = makeService({
        refreshTokens: [
          {
            id: 'r1',
            userId: 'u1',
            tokenHash: oldHash,
            expiresAt: future(),
            revokedAt: revokedAt(5_000),
            replacedById: 'r2',
          },
        ],
        users: [{ id: 'u1', role: 'manager', companyId: 'c1', isActive: true, tokenVersion: 0 }],
        companies: [{ id: 'c1', isActive: true }],
      });
      const req = makeReq({ [REFRESH_COOKIE]: 'refresh-token-old' });
      const res = makeRes();

      await expect(service.refresh(req as any, res)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(database.updates.filter((u) => (u as any).table === users)).toHaveLength(0);
      expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, COOKIE_OPTS);
    });

    it('revokes all sessions and bumps token version on stale reuse (theft)', async () => {
      const oldHash = sha256Hex('refresh-token-old');
      const { service, database } = makeService({
        refreshTokens: [
          {
            id: 'r1',
            userId: 'u1',
            tokenHash: oldHash,
            expiresAt: future(),
            revokedAt: revokedAt(120_000),
            replacedById: 'r2',
          },
        ],
        users: [{ id: 'u1', role: 'manager', companyId: 'c1', isActive: true, tokenVersion: 0 }],
        companies: [{ id: 'c1', isActive: true }],
      });
      const req = makeReq({ [REFRESH_COOKIE]: 'refresh-token-old' });
      const res = makeRes();

      await expect(service.refresh(req as any, res)).rejects.toBeInstanceOf(UnauthorizedException);

      const userUpdate = database.updates.find((u) => (u as any).table === users);
      expect(userUpdate).toBeDefined();
      expect((userUpdate as any).set.tokenVersion).toMatchObject({});
      expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, COOKIE_OPTS);
    });
  });

  describe('logout', () => {
    it('revokes the presented refresh token and clears cookies', async () => {
      const oldHash = sha256Hex('refresh-token-to-logout');
      const { service, database } = makeService({
        refreshTokens: [
          { id: 'r1', userId: 'u1', tokenHash: oldHash, expiresAt: future(), revokedAt: null },
        ],
        users: [],
        companies: [],
      });
      const req = makeReq({ [REFRESH_COOKIE]: 'refresh-token-to-logout' });
      const res = makeRes();

      await service.logout(req as any, res);

      const update = database.updates[0] as any;
      expect(update.table).toBe(refreshTokens);
      expect(update.set.revokedAt).toBeInstanceOf(Date);
      expect(res.clearCookie).toHaveBeenCalledWith(ACCESS_COOKIE, COOKIE_OPTS);
      expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, COOKIE_OPTS);
    });

    it('still clears cookies when no refresh cookie is present', async () => {
      const { service } = makeService({ refreshTokens: [], users: [], companies: [] });
      const req = makeReq();
      const res = makeRes();

      await expect(service.logout(req as any, res)).resolves.toBeUndefined();
      expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, COOKIE_OPTS);
    });
  });
});
