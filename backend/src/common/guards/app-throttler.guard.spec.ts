import { AppThrottlerGuard } from './app-throttler.guard';

type TrackerFn = (req: Record<string, unknown>) => Promise<string>;

function tracker(): TrackerFn {
  const guard = Object.create(AppThrottlerGuard.prototype) as { getTracker: TrackerFn };
  return guard.getTracker.bind(guard);
}

describe('AppThrottlerGuard', () => {
  it('tracks login by IP and normalised email', async () => {
    const result = await tracker()({
      method: 'POST',
      path: '/api/v1/auth/login',
      ip: '1.2.3.4',
      body: { email: '  User@Example.com ' },
    });
    expect(result).toBe('1.2.3.4:user@example.com');
  });

  it('tracks every other route by IP only', async () => {
    const result = await tracker()({
      method: 'GET',
      path: '/api/v1/health',
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
