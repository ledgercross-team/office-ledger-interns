import type { HrmsRole, OrgStatus } from './hrms-auth.types';

export const HRMS_AUTH_PATH = '/api/auth';
export const HRMS_PLATFORM_PATH = '/api/platform';
export const HRMS_ORG_PATH = '/api/org';

function under(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

export interface AccessCheck {
  role: HrmsRole | null;
  orgStatus: OrgStatus | null;
  method: string;
  path: string;
}

export type AccessDenial = { code: string; message: string } | null;

// Path and org-status rules that hold for every v2 route. Role lists per route come from
// the route's own decorator. Pure, so it can be tested without a database.
export function accessDenial({ role, orgStatus, method, path }: AccessCheck): AccessDenial {
  const platform = under(path, HRMS_PLATFORM_PATH);
  const auth = under(path, HRMS_AUTH_PATH);

  if (platform && role !== 'gameMaster') {
    return { code: 'PLATFORM_ONLY', message: 'Only a gameMaster can use the platform console.' };
  }
  if (role === 'gameMaster' && !platform && !auth) {
    return { code: 'GAME_MASTER_NO_ORG_DATA', message: 'A gameMaster cannot access organisation data.' };
  }

  if (orgStatus === 'blocked') {
    return { code: 'ORG_BLOCKED', message: 'This organisation has been blocked. Contact support.' };
  }
  if (orgStatus === 'suspended' && !auth) {
    const mayRenew = (role === 'ceo' || role === 'coo') && under(path, HRMS_ORG_PATH);
    if (!mayRenew) {
      return {
        code: 'ORG_SUSPENDED',
        message: 'This organisation is suspended. Only a CEO or COO can sign in, to renew.',
      };
    }
  }
  if (orgStatus === 'read_only' && !auth && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { code: 'ORG_READ_ONLY', message: 'This organisation is read-only until the subscription is renewed.' };
  }
  return null;
}
