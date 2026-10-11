import { AppThrottlerGuard } from './app-throttler.guard';

type AnyRequest = Record<string, any>;

function makeReq(partial: Partial<AnyRequest>): AnyRequest {
  return {
    method: 'GET',
    path: '/api/v1/health',
    ip: '203.0.113.7',
    body: {},
    headers: {},
    ...partial,
  };
}

const guard = Object.create(AppThrottlerGuard.prototype) as AppThrottlerGuard;

describe('AppThrottlerGuard', () => {
  it('tracks non-login routes by IP', async () => {
    const tracker = await (guard as any).getTracker(makeReq({}));
    expect(tracker).toBe('203.0.113.7');
  });

  it('tracks login by IP and normalized email', async () => {
    const tracker = await (guard as any).getTracker(
      makeReq({
        method: 'POST',
        path: '/api/v1/auth/login',
        body: { email: '  Alice@Example.com  ' },
      }),
    );
    expect(tracker).toBe('203.0.113.7:alice@example.com');
  });

  it('tracks login with an empty email suffix when absent', async () => {
    const tracker = await (guard as any).getTracker(
      makeReq({ method: 'POST', path: '/api/v1/auth/login', body: {} }),
    );
    expect(tracker).toBe('203.0.113.7:');
  });
});
