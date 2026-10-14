import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ConfigService } from '@nestjs/config';
import { HrmsContextService } from '../db/hrms-context';
import type { HrmsRequest } from '../db/hrms-context.interceptor';
import { accessDenial } from './hrms-access-rules';
import { HRMS_ROLES_KEY, HRMS_SESSION_KEY } from './hrms-auth.decorators';
import {
  HRMS_ACCESS_COOKIE,
  type HrmsMemberRole,
  type HrmsPrincipal,
  type HrmsRole,
  type OrgStatus,
} from './hrms-auth.types';
import { HrmsTokenService } from './hrms-token.service';

export interface HrmsAuthedRequest extends HrmsRequest {
  hrmsAuth?: HrmsPrincipal;
}

interface MemberLookup extends Record<string, unknown> {
  role: HrmsMemberRole;
  status: 'active' | 'suspended' | 'deactivated';
  org_status: OrgStatus;
}

function forbid(code: string, message: string): never {
  throw new ForbiddenException({ statusCode: 403, code, message });
}

// Deny by default: a route without @Public(), @HrmsSession() or @HrmsRoles() is closed.
// The membership is looked up again on every request, so a role change or deactivation
// takes effect at once.
@Injectable()
export class HrmsAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: HrmsTokenService,
    private readonly context: HrmsContextService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    const targets = [executionContext.getHandler(), executionContext.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = executionContext.switchToHttp().getRequest<HrmsAuthedRequest & Request>();
    const token = this.tokens.cookie(req, HRMS_ACCESS_COOKIE);
    if (!token) throw new UnauthorizedException();
    const payload = await this.tokens.verifyAccessToken(token);

    const principal = await this.resolvePrincipal(payload.sub, payload.mid, payload.oid);

    const denial = accessDenial({
      role: principal.role,
      orgStatus: principal.orgStatus,
      method: req.method,
      path: req.path,
    });
    if (denial) forbid(denial.code, denial.message);

    // A temporary password must be replaced before anything else; only /api/auth/* stays open.
    if (!req.path.startsWith('/api/auth/')) {
      const mustChange = await this.context.runSystem(
        async (tx) => {
          const r = await tx.execute<{ must_change_password: boolean }>(
            sql`select must_change_password from users where id = ${principal.userId}`,
          );
          return r.rows[0]?.must_change_password === true;
        },
        { userId: principal.userId },
      );
      if (mustChange)
        forbid('PASSWORD_CHANGE_REQUIRED', 'Choose your own password before you continue.');
    }

    const roles = this.reflector.getAllAndOverride<HrmsRole[] | undefined>(HRMS_ROLES_KEY, targets);
    const sessionOnly = this.reflector.getAllAndOverride<boolean>(HRMS_SESSION_KEY, targets);

    if (roles && roles.length > 0) {
      if (principal.role === null) {
        forbid('ORG_NOT_SELECTED', 'Choose an organisation first.');
      }
      if (!roles.includes(principal.role)) {
        forbid('ROLE_NOT_ALLOWED', 'You do not have access to this resource.');
      }
    } else if (!sessionOnly) {
      forbid('ROLE_NOT_ALLOWED', 'You do not have access to this resource.');
    }

    req.hrmsAuth = principal;
    req.hrmsContext = {
      orgId: principal.orgId,
      memberId: principal.memberId,
      userId: principal.userId,
    };
    return true;
  }

  private async resolvePrincipal(
    userId: string,
    memberId: string | null,
    orgId: string | null,
  ): Promise<HrmsPrincipal> {
    return this.context.runSystem(
      async (tx) => {
        if (memberId && orgId) {
          // app.org_id is the token's org, so row-level security confines this to that org.
          const found = await tx.execute<MemberLookup>(sql`
            select m.role, m.status, o.status as org_status
              from org_members m join orgs o on o.id = m.org_id
             where m.id = ${memberId} and m.user_id = ${userId} and m.org_id = ${orgId}`);
          const row = found.rows[0];
          if (!row || row.status !== 'active') {
            forbid(
              'MEMBERSHIP_INACTIVE',
              'Your membership in this organisation is no longer active.',
            );
          }
          return { userId, memberId, orgId, role: row.role, orgStatus: row.org_status };
        }

        const gm = await tx.execute(
          sql`select 1 from game_masters where user_id = ${userId} and status = 'active'`,
        );
        return {
          userId,
          memberId: null,
          orgId: null,
          role: gm.rows.length > 0 ? ('gameMaster' as const) : null,
          orgStatus: null,
        };
      },
      { userId, orgId: orgId ?? undefined },
    );
  }
}
