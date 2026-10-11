import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { OriginCheckMiddleware } from './origin-check.middleware';

const FRONTEND_URL = 'http://localhost:3000';

function run(method: string, origin?: string): { passed: boolean; error?: unknown } {
  const config = { get: () => FRONTEND_URL } as unknown as ConfigService;
  const middleware = new OriginCheckMiddleware(config);
  const req = { method, headers: origin === undefined ? {} : { origin } } as unknown as Request;
  let passed = false;

  try {
    middleware.use(req, {} as Response, () => {
      passed = true;
    });
  } catch (error) {
    return { passed, error };
  }

  return { passed };
}

describe('OriginCheckMiddleware', () => {
  it('rejects a POST from a foreign origin with 403', () => {
    const result = run('POST', 'http://evil.test');
    expect(result.passed).toBe(false);
    expect(result.error).toBeInstanceOf(ForbiddenException);
  });

  it('allows a POST from FRONTEND_URL', () => {
    expect(run('POST', FRONTEND_URL).passed).toBe(true);
  });

  it('allows a POST without an Origin header', () => {
    expect(run('POST').passed).toBe(true);
  });

  it('allows a GET from a foreign origin', () => {
    expect(run('GET', 'http://evil.test').passed).toBe(true);
  });
});
