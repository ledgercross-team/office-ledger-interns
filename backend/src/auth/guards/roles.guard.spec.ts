import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Role } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

interface RouteMeta {
  isPublic?: boolean;
  roles?: Role[];
}

function canActivate(meta: RouteMeta, role?: Role): boolean {
  const reflector = {
    getAllAndOverride: (key: string) => (key === IS_PUBLIC_KEY ? meta.isPublic : meta.roles),
  } as unknown as Reflector;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  } as unknown as ExecutionContext;

  return new RolesGuard(reflector).canActivate(context);
}

describe('RolesGuard', () => {
  it('uses the metadata key set by @Roles()', () => {
    expect(ROLES_KEY).toBe('roles');
  });

  it('lets a public route through', () => {
    expect(canActivate({ isPublic: true })).toBe(true);
  });

  it('denies a route without @Roles for any user', () => {
    expect(() => canActivate({}, 'admin')).toThrow(ForbiddenException);
  });

  it('denies an empty @Roles() list', () => {
    expect(() => canActivate({ roles: [] }, 'admin')).toThrow(ForbiddenException);
  });

  it('allows a listed role', () => {
    expect(canActivate({ roles: ['admin', 'manager'] }, 'manager')).toBe(true);
  });

  it('denies a role that is not listed', () => {
    expect(() => canActivate({ roles: ['admin', 'manager'] }, 'employee')).toThrow(
      ForbiddenException,
    );
  });
});
