import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { hashPassword } from '../common/utils/passwords';
import { RedisService } from '../modules/redis/redis.service';
import { type FakeDbConfig, fakeDatabase, fakeRedisClient } from '../test-support/fake-db';
import { AuthService } from './auth.service';

const GENERIC_LOGIN_MESSAGE = 'Email or password is incorrect.';
const SUBSCRIPTION_MESSAGE = "Your company's subscription has ended. Please contact your admin.";

async function buildService(config: FakeDbConfig) {
  const redis = fakeRedisClient();
  redis.get.mockResolvedValue(null);
  const service = new AuthService(fakeDatabase(config), {
    client: redis,
  } as unknown as RedisService);
  return { service, redis };
}

describe('AuthService', () => {
  describe('validateCredentials', () => {
    it('rejects an unknown email with the generic message', async () => {
      const { service } = await buildService({ users: [], companies: [] });

      await expect(service.validateCredentials('nobody@example.com', 'password')).rejects.toThrow(
        new UnauthorizedException(GENERIC_LOGIN_MESSAGE),
      );
    });

    it('rejects a wrong password with the generic message', async () => {
      const passwordHash = await hashPassword('correct-horse');
      const { service } = await buildService({
        users: [
          {
            id: 'u1',
            email: 'alice@example.com',
            passwordHash,
            role: 'manager',
            companyId: 'c1',
            fullName: 'Alice',
            isActive: true,
            mustChangePassword: true,
            tokenVersion: 0,
          },
        ],
        companies: [{ id: 'c1', isActive: true }],
        subscriptions: [],
      });

      await expect(
        service.validateCredentials('alice@example.com', 'not-the-password'),
      ).rejects.toThrow(new UnauthorizedException(GENERIC_LOGIN_MESSAGE));
    });

    it('rejects an inactive user with the generic message', async () => {
      const passwordHash = await hashPassword('correct-horse');
      const { service } = await buildService({
        users: [
          {
            id: 'u1',
            email: 'alice@example.com',
            passwordHash,
            role: 'employee',
            companyId: 'c1',
            fullName: 'Alice',
            isActive: false,
            mustChangePassword: false,
            tokenVersion: 0,
          },
        ],
        companies: [{ id: 'c1', isActive: true }],
        subscriptions: [],
      });

      await expect(
        service.validateCredentials('alice@example.com', 'correct-horse'),
      ).rejects.toThrow(new UnauthorizedException(GENERIC_LOGIN_MESSAGE));
    });

    it('blocks a manager with an inactive subscription', async () => {
      const passwordHash = await hashPassword('correct-horse');
      const { service } = await buildService({
        users: [
          {
            id: 'u1',
            email: 'alice@example.com',
            passwordHash,
            role: 'manager',
            companyId: 'c1',
            fullName: 'Alice',
            isActive: true,
            mustChangePassword: false,
            tokenVersion: 0,
          },
        ],
        companies: [{ id: 'c1', isActive: true }],
        subscriptions: [],
      });

      await expect(
        service.validateCredentials('alice@example.com', 'correct-horse'),
      ).rejects.toThrow(new ForbiddenException(SUBSCRIPTION_MESSAGE));
    });

    it('allows an admin even when the subscription is inactive', async () => {
      const passwordHash = await hashPassword('correct-horse');
      const { service } = await buildService({
        users: [
          {
            id: 'u1',
            email: 'boss@example.com',
            passwordHash,
            role: 'admin',
            companyId: 'c1',
            fullName: 'Boss',
            isActive: true,
            mustChangePassword: false,
            tokenVersion: 2,
          },
        ],
        companies: [{ id: 'c1', isActive: true }],
        subscriptions: [],
      });

      await expect(
        service.validateCredentials('boss@example.com', 'correct-horse'),
      ).resolves.toMatchObject({
        id: 'u1',
        role: 'admin',
        companyId: 'c1',
        tokenVersion: 2,
      });
    });

    it('allows a game_master without a company', async () => {
      const passwordHash = await hashPassword('correct-horse');
      const { service } = await buildService({
        users: [
          {
            id: 'gm1',
            email: 'gm@office-ledger.app',
            passwordHash,
            role: 'game_master',
            companyId: null,
            fullName: 'GM',
            isActive: true,
            mustChangePassword: true,
            tokenVersion: 0,
          },
        ],
        companies: [],
      });

      await expect(
        service.validateCredentials('gm@office-ledger.app', 'correct-horse'),
      ).resolves.toMatchObject({
        id: 'gm1',
        role: 'game_master',
        companyId: null,
      });
    });

    it('normalizes the email case before matching', async () => {
      const passwordHash = await hashPassword('correct-horse');
      const { service } = await buildService({
        users: [
          {
            id: 'u1',
            email: 'alice@example.com',
            passwordHash,
            role: 'employee',
            companyId: 'c1',
            fullName: 'Alice',
            isActive: true,
            mustChangePassword: false,
            tokenVersion: 0,
          },
        ],
        companies: [{ id: 'c1', isActive: true }],
        subscriptions: [
          {
            id: 's1',
            companyId: 'c1',
            cancelledAt: null,
            startsOn: '2026-01-01',
            endsOn: '2026-12-31',
          },
        ],
      });

      await expect(
        service.validateCredentials('  ALICE@Example.COM  ', 'correct-horse'),
      ).resolves.toMatchObject({ id: 'u1' });
    });
  });

  describe('getSubscriptionActive', () => {
    it('returns the cached value when Redis has one', async () => {
      const redis = fakeRedisClient();
      redis.get.mockResolvedValue('1');
      const service = new AuthService(fakeDatabase({}), {
        client: redis,
      } as unknown as RedisService);

      await expect(service.getSubscriptionActive('c1')).resolves.toBe(true);
      await expect(service.getSubscriptionActive('c1')).resolves.toBe(true);
    });

    it('queries the database on a miss and caches the result', async () => {
      const redis = fakeRedisClient();
      redis.get.mockResolvedValue(null);
      const service = new AuthService(
        fakeDatabase({
          companies: [{ id: 'c1', timezone: 'UTC' }],
          subscriptions: [
            {
              id: 's1',
              companyId: 'c1',
              cancelledAt: null,
              startsOn: '2026-01-01',
              endsOn: '2026-12-31',
            },
          ],
        }),
        { client: redis } as unknown as RedisService,
      );

      await expect(service.getSubscriptionActive('c1')).resolves.toBe(true);
      expect(redis.set).toHaveBeenCalledWith('company:c1:subscription-active', '1', 'EX', 300);
    });

    it('is resilient to a Redis outage and falls back to the database', async () => {
      const redis = fakeRedisClient();
      redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
      const service = new AuthService(
        fakeDatabase({
          companies: [{ id: 'c1', timezone: 'UTC' }],
          subscriptions: [],
        }),
        { client: redis } as unknown as RedisService,
      );

      await expect(service.getSubscriptionActive('c1')).resolves.toBe(false);
    });
  });

  describe('me', () => {
    it('returns the public user with a subscription flag for company roles', async () => {
      const { service } = await buildService({
        users: [
          {
            id: 'u1',
            role: 'employee',
            email: 'alice@example.com',
            companyId: 'c1',
            fullName: 'Alice',
            mustChangePassword: false,
          },
        ],
        companies: [{ id: 'c1', timezone: 'UTC' }],
        subscriptions: [
          {
            id: 's1',
            companyId: 'c1',
            cancelledAt: null,
            startsOn: '2026-01-01',
            endsOn: '2026-12-31',
          },
        ],
      });

      await expect(
        service.me({
          id: 'u1',
          role: 'employee',
          companyId: 'c1',
          fullName: 'Alice',
          mustChangePassword: false,
        }),
      ).resolves.toEqual({
        user: {
          id: 'u1',
          role: 'employee',
          email: 'alice@example.com',
          companyId: 'c1',
          fullName: 'Alice',
          mustChangePassword: false,
          subscriptionActive: true,
        },
      });
    });
  });
});
