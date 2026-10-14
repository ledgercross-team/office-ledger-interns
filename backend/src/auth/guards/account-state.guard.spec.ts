import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { AuthService } from '../auth.service';
import type { AuthUser } from '../auth.types';
import { AccountStateGuard } from './account-state.guard';

function build(subscriptionActive: boolean) {
  const getSubscriptionActive = jest.fn().mockResolvedValue(subscriptionActive);
  const run = (path: string, user: AuthUser | undefined, isPublic = false) => {
    const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
    const guard = new AccountStateGuard(reflector, {
      getSubscriptionActive,
    } as unknown as AuthService);

    return guard.canActivate({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ path, user }) }),
    } as unknown as ExecutionContext);
  };

  return { run, getSubscriptionActive };
}

const user = (overrides: Partial<AuthUser>): AuthUser => ({
  id: 'u1',
  role: 'employee',
  companyId: 'c1',
  fullName: 'Test User',
  mustChangePassword: false,
  ...overrides,
});

async function codeOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ForbiddenException);
    return ((error as ForbiddenException).getResponse() as { code: string }).code;
  }
  return undefined;
}

describe('AccountStateGuard', () => {
  it('skips public routes', async () => {
    const { run } = build(false);
    await expect(run('/api/v1/health', undefined, true)).resolves.toBe(true);
  });

  describe('mustChangePassword', () => {
    const pending = user({ mustChangePassword: true });

    it.each(['/api/v1/auth/me', '/api/v1/auth/change-password', '/api/v1/auth/logout'])(
      'allows %s',
      async (path) => {
        await expect(build(true).run(path, pending)).resolves.toBe(true);
      },
    );

    it('answers 403 PASSWORD_CHANGE_REQUIRED elsewhere', async () => {
      expect(await codeOf(build(true).run('/api/v1/tasks', pending))).toBe(
        'PASSWORD_CHANGE_REQUIRED',
      );
    });
  });

  describe('inactive subscription', () => {
    it('answers 403 SUBSCRIPTION_INACTIVE outside the allowed list', async () => {
      const admin = user({ role: 'admin' });
      expect(await codeOf(build(false).run('/api/v1/users', admin))).toBe('SUBSCRIPTION_INACTIVE');
    });

    it.each(['/api/v1/auth/me', '/api/v1/company/subscription', '/api/v1/message-threads/abc'])(
      'lets an admin reach %s',
      async (path) => {
        await expect(build(false).run(path, user({ role: 'admin' }))).resolves.toBe(true);
      },
    );

    it('keeps message threads admin-only', async () => {
      const manager = user({ role: 'manager' });
      expect(await codeOf(build(false).run('/api/v1/message-threads', manager))).toBe(
        'SUBSCRIPTION_INACTIVE',
      );
    });

    it('does not check the subscription for the game master', async () => {
      const { run, getSubscriptionActive } = build(false);
      const gm = user({ role: 'game_master', companyId: null });
      await expect(run('/api/v1/game-master/companies', gm)).resolves.toBe(true);
      expect(getSubscriptionActive).not.toHaveBeenCalled();
    });

    it('allows everything while the subscription is active', async () => {
      await expect(build(true).run('/api/v1/tasks', user({}))).resolves.toBe(true);
    });
  });

  it('leaves /api paths alone, even for a user with a pending password change', async () => {
    const { run, getSubscriptionActive } = build(false);
    await expect(
      run('/api/health', user({ mustChangePassword: true })),
    ).resolves.toBe(true);
    expect(getSubscriptionActive).not.toHaveBeenCalled();
  });

  it('still enforces the pending password change on v1 paths', async () => {
    const { run } = build(true);
    expect(await codeOf(run('/api/v1/tasks', user({ mustChangePassword: true })))).toBe(
      'PASSWORD_CHANGE_REQUIRED',
    );
  });
});
