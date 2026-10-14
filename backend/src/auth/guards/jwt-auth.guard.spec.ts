import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

function context(path: string): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ path }) }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const reflector = { getAllAndOverride: () => false } as unknown as Reflector;

  it('does not run the v1 JWT check for /api paths', () => {
    expect(new JwtAuthGuard(reflector).canActivate(context('/api/health'))).toBe(true);
  });

  it('lets a public v1 route through', () => {
    const publicReflector = { getAllAndOverride: () => true } as unknown as Reflector;
    expect(new JwtAuthGuard(publicReflector).canActivate(context('/api/v1/health'))).toBe(true);
  });
});
