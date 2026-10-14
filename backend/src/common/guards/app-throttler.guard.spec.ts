import {
  AppThrottlerGuard,
  LOGIN_ABUSE_ATTEMPTS,
  LOGIN_ABUSE_BLOCK_SECONDS,
  registerLoginAttempt,
} from './app-throttler.guard';

type TrackerFn = (req: Record<string, unknown>) => Promise<string>;

function tracker(): TrackerFn {
  const guard = Object.create(AppThrottlerGuard.prototype) as { getTracker: TrackerFn };
  return guard.getTracker.bind(guard);
}

describe('AppThrottlerGuard', () => {
  it('tracks login by IP and normalised email', async () => {
    const result = await tracker()({
      method: 'POST',
      path: '/api/auth/login',
      ip: '1.2.3.4',
      body: { email: '  User@Example.com ' },
    });
    expect(result).toBe('1.2.3.4:user@example.com');
  });

  it('tracks every other route by IP only', async () => {
    const result = await tracker()({
      method: 'GET',
      path: '/api/health',
      ip: '1.2.3.4',
      body: {},
    });
    expect(result).toBe('1.2.3.4');
  });

  it('tracks v2 login by IP and normalised email too', async () => {
    const result = await tracker()({
      method: 'POST',
      path: '/api/auth/login',
      ip: '1.2.3.4',
      body: { email: 'User@Example.com' },
    });
    expect(result).toBe('1.2.3.4:user@example.com');
  });
});

describe('registerLoginAttempt', () => {
  function fakeRedis() {
    const store = new Map<string, number>();
    const ttls = new Map<string, number>();
    return {
      store,
      ttls,
      incr: async (k: string) => {
        store.set(k, (store.get(k) ?? 0) + 1);
        return store.get(k)!;
      },
      expire: async (k: string, s: number) => void ttls.set(k, s),
      exists: async (k: string) => (store.has(k) ? 1 : 0),
      set: async (k: string, _v: string, _m: 'EX', s: number) => {
        store.set(k, 1);
        ttls.set(k, s);
      },
      ttl: async (k: string) => ttls.get(k) ?? -1,
    };
  }

  it('lets 70 attempts through and blocks the pair for 12 hours on the 71st', async () => {
    const redis = fakeRedis();
    for (let i = 0; i < LOGIN_ABUSE_ATTEMPTS; i += 1) {
      expect(await registerLoginAttempt(redis, '1.2.3.4:a@b.io')).toBe(0);
    }
    expect(await registerLoginAttempt(redis, '1.2.3.4:a@b.io')).toBe(LOGIN_ABUSE_BLOCK_SECONDS);
    // still blocked afterwards, with the remaining time
    expect(await registerLoginAttempt(redis, '1.2.3.4:a@b.io')).toBe(LOGIN_ABUSE_BLOCK_SECONDS);
  });

  it('keeps each IP and email pair separate', async () => {
    const redis = fakeRedis();
    for (let i = 0; i <= LOGIN_ABUSE_ATTEMPTS; i += 1)
      await registerLoginAttempt(redis, '1.2.3.4:a@b.io');
    expect(await registerLoginAttempt(redis, '1.2.3.4:other@b.io')).toBe(0);
    expect(await registerLoginAttempt(redis, '9.9.9.9:a@b.io')).toBe(0);
  });
});
