import { RedisService } from '../modules/redis/redis.service';
import { AuthStateService } from './auth-state.service';
import { fakeDatabase, fakeRedisClient } from '../test-support/fake-db';

describe('AuthStateService', () => {
  it('returns the cached state and skips repopulating Redis', async () => {
    const redis = fakeRedisClient();
    redis.get.mockResolvedValue(
      JSON.stringify({
        role: 'manager',
        companyId: 'c1',
        fullName: 'Alice',
        isActive: true,
        companyActive: true,
        tokenVersion: 3,
        mustChangePassword: true,
      }),
    );

    const service = new AuthStateService(fakeDatabase({}), {
      client: redis,
    } as unknown as RedisService);

    const state = await service.getAuthState('u1');

    expect(state).toEqual({
      role: 'manager',
      companyId: 'c1',
      fullName: 'Alice',
      isActive: true,
      companyActive: true,
      tokenVersion: 3,
      mustChangePassword: true,
    });
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('rebuilds from the database on a miss and caches the result', async () => {
    const redis = fakeRedisClient();
    redis.get.mockResolvedValue(null);

    const database = fakeDatabase({
      users: [
        {
          id: 'u1',
          role: 'employee',
          companyId: 'c1',
          fullName: 'Bob',
          isActive: true,
          mustChangePassword: false,
          tokenVersion: 1,
        },
      ],
      companies: [{ id: 'c1', isActive: true }],
    });

    const service = new AuthStateService(database, { client: redis } as unknown as RedisService);

    const state = await service.getAuthState('u1');

    expect(state).toEqual({
      role: 'employee',
      companyId: 'c1',
      fullName: 'Bob',
      isActive: true,
      companyActive: true,
      tokenVersion: 1,
      mustChangePassword: false,
    });
    expect(redis.set).toHaveBeenCalledWith('auth:user:u1', JSON.stringify(state), 'EX', 300);
  });

  it('returns null for an unknown user', async () => {
    const redis = fakeRedisClient();
    redis.get.mockResolvedValue(null);

    const service = new AuthStateService(fakeDatabase({ users: [], companies: [] }), {
      client: redis,
    } as unknown as RedisService);

    await expect(service.getAuthState('missing')).resolves.toBeNull();
  });

  it('invalidates the cached key', async () => {
    const redis = fakeRedisClient();
    const service = new AuthStateService(fakeDatabase({}), {
      client: redis,
    } as unknown as RedisService);
    await service.invalidate('u1');
    expect(redis.del).toHaveBeenCalledWith('auth:user:u1');
  });

  it('returns a default state instead of throwing when Redis is down', async () => {
    const redis = fakeRedisClient();
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));

    const database = fakeDatabase({
      users: [
        {
          id: 'u1',
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

    const service = new AuthStateService(database, { client: redis } as unknown as RedisService);

    const state = await service.getAuthState('u1');

    expect(state?.role).toBe('game_master');
    expect(state?.companyActive).toBe(true);
  });
});
