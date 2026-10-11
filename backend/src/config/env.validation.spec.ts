import { validateEnvironment } from './env.validation';

const validEnvironment = {
  NODE_ENV: 'test',
  PORT: '4000',
  DATABASE_URL: 'postgres://user:password@localhost:5432/database',
  REDIS_URL: 'redis://localhost:6379/0',
  FRONTEND_URL: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-chars-long',
  JWT_ACCESS_TTL_SECONDS: '900',
  REFRESH_TOKEN_TTL_DAYS: '7',
  COOKIE_SECURE: 'false',
  COOKIE_DOMAIN: '',
  TRUST_PROXY: 'false',
  RATE_LIMIT_GLOBAL_PER_MIN: '100',
  SEED_DEMO_PASSWORD: 'test-password',
};

describe('validateEnvironment', () => {
  it('parses valid environment values', () => {
    const result = validateEnvironment(validEnvironment);

    expect(result.PORT).toBe(4000);
    expect(result.COOKIE_SECURE).toBe(false);
    expect(result.TRUST_PROXY).toBe(false);
  });

  it('rejects missing required environment values', () => {
    const { DATABASE_URL: _, ...missingDatabaseUrl } = validEnvironment;

    expect(() => validateEnvironment(missingDatabaseUrl)).toThrow('Environment validation failed');
  });

  it('rejects invalid environment values', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        PORT: '70000',
        COOKIE_SECURE: 'yes',
      }),
    ).toThrow('Environment validation failed');
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_ACCESS_SECRET: 'too-short',
      }),
    ).toThrow('Environment validation failed');
  });

  it('rejects an insecure cookie in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow('Environment validation failed');
  });
});
