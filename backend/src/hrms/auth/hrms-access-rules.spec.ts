import { accessDenial } from './hrms-access-rules';
import { isUsableMembership } from './hrms-auth.types';

const check = (
  role: Parameters<typeof accessDenial>[0]['role'],
  orgStatus: Parameters<typeof accessDenial>[0]['orgStatus'],
  method: string,
  path: string,
) => accessDenial({ role, orgStatus, method, path })?.code ?? null;

describe('accessDenial', () => {
  describe('platform routes', () => {
    it('are for gameMasters only', () => {
      expect(check('gameMaster', null, 'GET', '/api/platform/orgs')).toBeNull();
      expect(check('ceo', 'active', 'GET', '/api/platform/orgs')).toBe('PLATFORM_ONLY');
      expect(check('employee', 'active', 'GET', '/api/platform/orgs')).toBe('PLATFORM_ONLY');
      expect(check(null, null, 'GET', '/api/platform/orgs')).toBe('PLATFORM_ONLY');
    });

    it('are the only non-auth routes a gameMaster may call', () => {
      expect(check('gameMaster', null, 'GET', '/api/auth/me')).toBeNull();
      expect(check('gameMaster', null, 'GET', '/api/tasks')).toBe('GAME_MASTER_NO_ORG_DATA');
      expect(check('gameMaster', null, 'GET', '/api/org')).toBe('GAME_MASTER_NO_ORG_DATA');
      expect(check('gameMaster', null, 'GET', '/api/platformx')).toBe('GAME_MASTER_NO_ORG_DATA');
    });
  });

  describe('org status', () => {
    it('refuses everyone in a blocked org', () => {
      expect(check('ceo', 'blocked', 'GET', '/api/org')).toBe('ORG_BLOCKED');
      expect(check('ceo', 'blocked', 'GET', '/api/auth/me')).toBe('ORG_BLOCKED');
    });

    it('lets only CEO and COO into a suspended org, and only to renew', () => {
      expect(check('ceo', 'suspended', 'GET', '/api/org')).toBeNull();
      expect(check('coo', 'suspended', 'POST', '/api/org/export')).toBeNull();
      expect(check('ceo', 'suspended', 'GET', '/api/auth/me')).toBeNull();
      expect(check('ceo', 'suspended', 'GET', '/api/tasks')).toBe('ORG_SUSPENDED');
      expect(check('manager', 'suspended', 'GET', '/api/org')).toBe('ORG_SUSPENDED');
    });

    it('allows only reads in a read-only org, but keeps auth routes working', () => {
      expect(check('ceo', 'read_only', 'GET', '/api/tasks')).toBeNull();
      expect(check('ceo', 'read_only', 'POST', '/api/tasks')).toBe('ORG_READ_ONLY');
      expect(check('employee', 'read_only', 'PATCH', '/api/members/1')).toBe('ORG_READ_ONLY');
      expect(check('employee', 'read_only', 'POST', '/api/auth/logout')).toBeNull();
    });

    it('does not restrict active or grace orgs', () => {
      expect(check('manager', 'active', 'POST', '/api/tasks')).toBeNull();
      expect(check('manager', 'grace', 'POST', '/api/tasks')).toBeNull();
    });
  });
});

describe('isUsableMembership', () => {
  it('needs an active member in an org that is not blocked', () => {
    expect(isUsableMembership({ status: 'active', orgStatus: 'active', role: 'employee' })).toBe(true);
    expect(isUsableMembership({ status: 'deactivated', orgStatus: 'active', role: 'ceo' })).toBe(false);
    expect(isUsableMembership({ status: 'suspended', orgStatus: 'active', role: 'employee' })).toBe(false);
    expect(isUsableMembership({ status: 'active', orgStatus: 'blocked', role: 'ceo' })).toBe(false);
  });

  it('admits only CEO and COO to a suspended org', () => {
    expect(isUsableMembership({ status: 'active', orgStatus: 'suspended', role: 'coo' })).toBe(true);
    expect(isUsableMembership({ status: 'active', orgStatus: 'suspended', role: 'manager' })).toBe(false);
  });
});
