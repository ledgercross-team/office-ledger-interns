export const HRMS_ACCESS_COOKIE = 'hrms_access';
export const HRMS_REFRESH_COOKIE = 'hrms_refresh';
// The issuer and audience a session token must carry.
export const HRMS_JWT_ISSUER = 'office-ledger-hrms-api';
export const HRMS_JWT_AUDIENCE = 'office-ledger-hrms-web';
// A password-checked sign-in that still needs its one-time code. Never accepted as a session.

export type HrmsMemberRole = 'ceo' | 'coo' | 'manager' | 'employee';
export type HrmsRole = HrmsMemberRole | 'gameMaster';
export type OrgStatus = 'active' | 'grace' | 'read_only' | 'suspended' | 'blocked';

/** The access token carries who and where, never the role: the role is read on every request. */
export interface HrmsJwtPayload {
  sub: string; // users.id
  mid: string | null; // org_members.id of the active membership
  oid: string | null; // orgs.id of the active membership
}

/** What the auth guard resolved for this request. */
export interface HrmsPrincipal {
  userId: string;
  memberId: string | null;
  orgId: string | null;
  /** null: signed in but no organisation chosen yet (the org switcher step). */
  role: HrmsRole | null;
  orgStatus: OrgStatus | null;
}

export interface MembershipRow {
  memberId: string;
  orgId: string;
  orgName: string;
  orgStatus: OrgStatus;
  role: HrmsMemberRole;
  status: 'active' | 'suspended' | 'deactivated';
}

export interface MembershipView extends MembershipRow {
  /** Whether this membership may be used to sign in right now. */
  usable: boolean;
}

/** Active member, and the org is not blocked; a suspended org admits only CEO and COO. */
export function isUsableMembership(
  m: Pick<MembershipRow, 'status' | 'orgStatus' | 'role'>,
): boolean {
  if (m.status !== 'active') return false;
  if (m.orgStatus === 'blocked') return false;
  if (m.orgStatus === 'suspended') return m.role === 'ceo' || m.role === 'coo';
  return true;
}
