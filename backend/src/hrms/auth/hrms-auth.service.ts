import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from '../../common/utils/passwords';
import { HrmsContextService, type HrmsTransaction } from '../db/hrms-context';
import type { HrmsChangePasswordDto, HrmsLoginDto } from './dto/hrms-auth.dto';
import {
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateSecret,
  otpauthUrl,
  parseKey,
  verifyTotp,
} from './mfa';
import { HrmsTokenService, type Session } from './hrms-token.service';
import {
  isUsableMembership,
  type HrmsPrincipal,
  type HrmsRole,
  type OrgStatus,
  type MembershipRow,
  type MembershipView,
} from './hrms-auth.types';

interface UserRow extends Record<string, unknown> {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  timezone: string;
  mfa_enabled: boolean;
}

interface MembershipDbRow extends Record<string, unknown> {
  member_id: string;
  org_id: string;
  org_name: string;
  org_status: MembershipRow['orgStatus'];
  role: MembershipRow['role'];
  status: MembershipRow['status'];
}

export interface SessionView {
  user: { id: string; email: string; fullName: string; timezone: string; mfaEnabled: boolean };
  isGameMaster: boolean;
  memberships: MembershipView[];
  /** The membership this session works in, or null before an org is chosen. */
  activeMemberId: string | null;
  /** gameMaster, the active membership's role, or null before an org is chosen. */
  role: HrmsRole | null;
  org: { id: string; name: string; status: OrgStatus } | null;
  needsOrgSelection: boolean;
}

const INVALID_LOGIN = 'Incorrect email or password.';
const BACKUP_CODE_COUNT = 5;

const backupHash = (code: string) =>
  createHash('sha256').update(code.replace(/[\s-]/g, '').toUpperCase()).digest('hex');

@Injectable()
export class HrmsAuthService {
  // Verified against when the email is unknown, so both cases take about the same time.
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly context: HrmsContextService,
    private readonly tokens: HrmsTokenService,
    private readonly config: ConfigService,
  ) {}

  private mfaKey(): Buffer {
    return parseKey(this.config.getOrThrow<string>('MFA_ENCRYPTION_KEY'));
  }

  /**
   * Email plus password, or, for a person who turned the authenticator on in their profile,
   * email plus a 6-digit code (or a backup code) in the same field. A password is not accepted
   * for them; typing one gets a message to use the code instead.
   */
  async login(dto: HrmsLoginDto, req: Request, res: Response): Promise<SessionView> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.context.runSystem(async (tx) => {
      const result = await tx.execute<UserRow>(sql`
        select id, email::text as email, password_hash, full_name, timezone, mfa_enabled
          from users where email = ${email}`);
      return result.rows[0] ?? null;
    });

    if (
      user?.mfa_enabled &&
      !/^(\d{6}|[A-Za-z2-7]{4}-?[A-Za-z2-7]{4})$/.test(dto.password.trim())
    ) {
      // Said plainly so the person is not left guessing why their password fails. It does
      // reveal that this email uses an authenticator.
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'MFA_CODE_REQUIRED',
        message:
          'Enter the 6-digit code from your app (or a backup code). This account uses an authenticator, so your password is not used to sign in.',
      });
    }
    const valid = user?.mfa_enabled
      ? await this.verifyCode(user.id, dto.password)
      : await verifyPassword(user?.password_hash ?? (await this.getDummyHash()), dto.password);
    if (!user || !valid)
      throw new UnauthorizedException(
        user?.mfa_enabled ? 'The code is not correct.' : INVALID_LOGIN,
      );

    const { isGameMaster, memberships } = await this.loadIdentity(user.id);
    const usable = memberships.filter((m) => m.usable);

    if (!isGameMaster && usable.length === 0) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'NO_ACTIVE_MEMBERSHIP',
        message:
          memberships.length === 0
            ? 'This account does not belong to any organisation.'
            : 'None of your organisations can be used right now (deactivated, suspended or blocked).',
      });
    }

    return this.completeLogin(user, isGameMaster, memberships, req, res);
  }

  /** True for a valid authenticator code, or an unused backup code (which this spends). */
  private async verifyCode(userId: string, input: string): Promise<boolean> {
    const code = input.trim();
    if (/^\d{6}$/.test(code)) {
      const row = await this.context.runSystem(
        async (tx) => {
          const r = await tx.execute<{ mfa_secret_enc: Buffer | null }>(
            sql`select mfa_secret_enc from users where id = ${userId}`,
          );
          return r.rows[0] ?? null;
        },
        { userId },
      );
      if (!row?.mfa_secret_enc) return false;
      try {
        return verifyTotp(decryptSecret(Buffer.from(row.mfa_secret_enc), this.mfaKey()), code);
      } catch {
        return false;
      }
    }
    return this.context.runSystem(
      async (tx) => {
        const r = await tx.execute(sql`
          update user_mfa_backup_codes set used_at = now()
           where user_id = ${userId} and code_hash = ${backupHash(code)} and used_at is null
          returning 1`);
        return r.rows.length > 0;
      },
      { userId },
    );
  }

  /** Profile → Security, step 1: needs the password, makes the secret for the authenticator app. */
  async mfaSetup(
    principal: HrmsPrincipal,
    password: string,
  ): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.loadUser(principal.userId);
    if (user.mfa_enabled)
      throw new ConflictException('The authenticator is already on. Turn it off first.');
    if (!(await verifyPassword(user.password_hash, password))) {
      throw new UnauthorizedException('Your password is incorrect.');
    }
    const secret = generateSecret();
    const blob = encryptSecret(secret, this.mfaKey());
    await this.context.runSystem(
      async (tx) => {
        await tx.execute(
          sql`update users set mfa_secret_enc = ${blob}, mfa_enabled = false where id = ${user.id}`,
        );
      },
      { userId: user.id },
    );
    return { secret, otpauthUrl: otpauthUrl(user.email, secret) };
  }

  /** Step 2: a valid code from the app turns it on and returns the backup codes, once. */
  async mfaEnable(principal: HrmsPrincipal, code: string): Promise<{ backupCodes: string[] }> {
    const user = await this.loadUser(principal.userId);
    if (user.mfa_enabled) throw new ConflictException('The authenticator is already on.');
    if (!/^\d{6}$/.test(code.trim()) || !(await this.verifyCode(user.id, code))) {
      throw new UnauthorizedException('The code is not correct.');
    }
    const backupCodes = await this.replaceBackupCodes(user.id, true);
    return { backupCodes };
  }

  /** Five fresh backup codes in place of every old one. Needs a current app code, not a backup code. */
  async mfaNewBackupCodes(
    principal: HrmsPrincipal,
    code: string,
  ): Promise<{ backupCodes: string[] }> {
    const user = await this.loadUser(principal.userId);
    if (!user.mfa_enabled) throw new ConflictException('Turn the authenticator on first.');
    if (!/^\d{6}$/.test(code.trim()) || !(await this.verifyCode(user.id, code))) {
      throw new UnauthorizedException('The code is not correct.');
    }
    return { backupCodes: await this.replaceBackupCodes(user.id, false) };
  }

  private async replaceBackupCodes(userId: string, turnOn: boolean): Promise<string[]> {
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => {
      const raw = base32Encode(randomBytes(5));
      return `${raw.slice(0, 4)}-${raw.slice(4)}`;
    });
    await this.context.runSystem(
      async (tx) => {
        await tx.execute(sql`delete from user_mfa_backup_codes where user_id = ${userId}`);
        for (const c of codes) {
          await tx.execute(
            sql`insert into user_mfa_backup_codes (user_id, code_hash) values (${userId}, ${backupHash(c)})`,
          );
        }
        if (turnOn) await tx.execute(sql`update users set mfa_enabled = true where id = ${userId}`);
      },
      { userId },
    );
    return codes;
  }

  /** Turning it off needs a current code (or a backup code), so a stolen session cannot do it. */
  async mfaDisable(principal: HrmsPrincipal, code: string): Promise<void> {
    const user = await this.loadUser(principal.userId);
    if (!user.mfa_enabled) return;
    if (!(await this.verifyCode(user.id, code)))
      throw new UnauthorizedException('The code is not correct.');
    await this.clearMfa(user.id);
  }

  async clearMfa(userId: string): Promise<void> {
    await this.context.runSystem(
      async (tx) => {
        await tx.execute(sql`delete from user_mfa_backup_codes where user_id = ${userId}`);
        await tx.execute(
          sql`update users set mfa_enabled = false, mfa_secret_enc = null where id = ${userId}`,
        );
      },
      { userId },
    );
  }

  private async completeLogin(
    user: UserRow,
    isGameMaster: boolean,
    memberships: MembershipView[],
    req: Request,
    res: Response,
  ): Promise<SessionView> {
    const usable = memberships.filter((m) => m.usable);
    // One usable org signs in directly. Several (or a gameMaster) get a session with no org
    // yet; the client then calls switch-org with the chosen member id.
    const only = !isGameMaster && usable.length === 1 ? usable[0] : null;
    const session: Session = {
      userId: user.id,
      memberId: only?.memberId ?? null,
      orgId: only?.orgId ?? null,
    };
    await this.tokens.issue(session, req, res);
    await this.context.runSystem(
      async (tx) => {
        await tx.execute(sql`update users set last_login_at = now() where id = ${user.id}`);
      },
      { userId: user.id },
    );

    return this.toView(user, isGameMaster, memberships, session.memberId);
  }

  async switchOrg(
    principal: HrmsPrincipal,
    memberId: string,
    req: Request,
    res: Response,
  ): Promise<SessionView> {
    const { isGameMaster, memberships } = await this.loadIdentity(principal.userId);
    const target = memberships.find((m) => m.memberId === memberId);
    if (!target || !target.usable) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MEMBERSHIP_NOT_USABLE',
        message: 'You cannot switch to that organisation.',
      });
    }

    // Replace the current refresh token so the old session cannot be used for the old org.
    await this.tokens.revokeCurrent(req, res);
    await this.tokens.issue(
      { userId: principal.userId, memberId: target.memberId, orgId: target.orgId },
      req,
      res,
    );
    await this.touchLastActive(principal.userId, target);

    const user = await this.loadUser(principal.userId);
    return this.toView(user, isGameMaster, memberships, target.memberId);
  }

  async me(principal: HrmsPrincipal): Promise<SessionView> {
    const [user, identity] = await Promise.all([
      this.loadUser(principal.userId),
      this.loadIdentity(principal.userId),
    ]);
    return this.toView(user, identity.isGameMaster, identity.memberships, principal.memberId);
  }

  async changePassword(
    principal: HrmsPrincipal,
    dto: HrmsChangePasswordDto,
    req: Request,
    res: Response,
  ): Promise<void> {
    const user = await this.loadUser(principal.userId);
    if (!(await verifyPassword(user.password_hash, dto.currentPassword))) {
      throw new UnauthorizedException('Your current password is incorrect.');
    }
    if (dto.newPassword.toLowerCase() === user.email.toLowerCase()) {
      throw new BadRequestException('The new password must not be your email address.');
    }
    const newHash = await hashPassword(dto.newPassword);

    await this.context.runSystem(
      async (tx) => {
        await tx.execute(sql`update users set password_hash = ${newHash} where id = ${user.id}`);
      },
      { userId: user.id },
    );

    // Every other session ends; this browser gets fresh tokens for the same org.
    await this.tokens.revokeAllForUser(user.id);
    await this.tokens.issue(
      { userId: principal.userId, memberId: principal.memberId, orgId: principal.orgId },
      req,
      res,
    );
  }

  /**
   * Sets the first password from a one-time invite link. The link is single use and is the
   * only way into a new account. The caller signs in afterwards as usual.
   */
  async acceptInvite(token: string, password: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const newHash = await hashPassword(password);
    const invalid = new BadRequestException('This link is invalid or has expired.');

    const userId = await this.context.runSystem(async (tx) => {
      // Claim the link first so two uses of it cannot both succeed.
      const claimed = await tx.execute<{ user_id: string }>(sql`
        update password_resets set used_at = now()
         where token_hash = ${tokenHash} and purpose in ('invite', 'ceo_recovery')
           and used_at is null and expires_at > now()
        returning user_id`);
      const id = claimed.rows[0]?.user_id;
      if (!id) return null;
      await tx.execute(sql`
        update users set password_hash = ${newHash},
               email_verified_at = coalesce(email_verified_at, now())
         where id = ${id}`);
      return id;
    });
    if (!userId) throw invalid;
    await this.tokens.revokeAllForUser(userId);
  }

  async logout(req: Request, res: Response): Promise<void> {
    await this.tokens.revokeCurrent(req, res);
  }

  private async loadUser(userId: string): Promise<UserRow> {
    const user = await this.context.runSystem(async (tx) => {
      const result = await tx.execute<UserRow>(sql`
        select id, email::text as email, password_hash, full_name, timezone, mfa_enabled
          from users where id = ${userId}`);
      return result.rows[0];
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private async loadIdentity(
    userId: string,
  ): Promise<{ isGameMaster: boolean; memberships: MembershipView[] }> {
    return this.context.runSystem(
      async (tx: HrmsTransaction) => {
        const gm = await tx.execute(
          sql`select 1 from game_masters where user_id = ${userId} and status = 'active'`,
        );
        // Row-level security hides every membership until an org is chosen, so this goes
        // through the function that checks app.user_id.
        const rows = await tx.execute<MembershipDbRow>(sql`
          select member_id, org_id, org_name, org_status, role, status
            from my_memberships(${userId}::uuid)`);
        const memberships = rows.rows.map((r): MembershipView => {
          const base: MembershipRow = {
            memberId: r.member_id,
            orgId: r.org_id,
            orgName: r.org_name,
            orgStatus: r.org_status,
            role: r.role,
            status: r.status,
          };
          return { ...base, usable: isUsableMembership(base) };
        });
        return { isGameMaster: gm.rows.length > 0, memberships };
      },
      { userId },
    );
  }

  // org_members.last_active_at orders the downgrade list (plan section 9).
  private async touchLastActive(userId: string, membership: MembershipView): Promise<void> {
    await this.context.runSystem(
      async (tx) => {
        await tx.execute(
          sql`update org_members set last_active_at = now() where id = ${membership.memberId}`,
        );
      },
      { userId, orgId: membership.orgId },
    );
  }

  private toView(
    user: UserRow,
    isGameMaster: boolean,
    memberships: MembershipView[],
    activeMemberId: string | null,
  ): SessionView {
    const active = memberships.find((m) => m.memberId === activeMemberId) ?? null;
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        timezone: user.timezone,
        mfaEnabled: user.mfa_enabled,
      },
      isGameMaster,
      memberships,
      activeMemberId,
      role: active ? active.role : isGameMaster ? 'gameMaster' : null,
      org: active ? { id: active.orgId, name: active.orgName, status: active.orgStatus } : null,
      needsOrgSelection: !isGameMaster && activeMemberId === null,
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword('not-a-real-password-for-timing');
    return this.dummyHash;
  }
}
