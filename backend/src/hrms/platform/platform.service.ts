import { randomBytes, createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { hashPassword } from '../../common/utils/passwords';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsContextService } from '../db/hrms-context';
import { iso } from '../hrms-rows';
import { MailService } from '../mail/mail.service';
import type { CreateGameMasterDto, CreateOrgDto, LastCeoRemovalDto, RecoveryRequestDto, SetPlanDto } from './dto/platform.dto';

const INVITE_TTL_DAYS = 7;
const RECOVERY_TTL_HOURS = 48;

@Injectable()
export class PlatformService {
  constructor(
    private readonly context: HrmsContextService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  private frontend(): string {
    return (this.config.get<string>('FRONTEND_URL') ?? '').split(',')[0].trim();
  }

  /** A password-setting link. Only the hash is stored; the link goes by email, never in a response. */
  private async oneTimeLink(
    userId: string,
    purpose: 'invite' | 'ceo_recovery',
    ttl: string,
  ): Promise<{ token: string; hash: string; expiresAt: string }> {
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    const r = await this.context.tx.execute<{ expires_at: string }>(sql`
      insert into password_resets (user_id, purpose, token_hash, expires_at)
      values (${userId}, ${purpose}, ${hash}, now() + ${ttl}::interval)
      returning expires_at`);
    return { token, hash, expiresAt: r.rows[0].expires_at };
  }

  /** Finds the account for an email, or makes one nobody can sign in to until the link is used. */
  private async userFor(email: string, fullName: string): Promise<{ id: string; created: boolean }> {
    const tx = this.context.tx;
    const found = await tx.execute<{ id: string }>(sql`select id from users where email = ${email}`);
    if (found.rows[0]) return { id: found.rows[0].id, created: false };
    const unusable = await hashPassword(randomBytes(32).toString('base64url'));
    const made = await tx.execute<{ id: string }>(sql`
      insert into users (email, password_hash, full_name) values (${email}, ${unusable}, ${fullName}) returning id`);
    return { id: made.rows[0].id, created: true };
  }

  // ---- organisations --------------------------------------------------
  async listOrgs() {
    const r = await this.context.tx.execute<{
      org_id: string;
      name: string;
      status: string;
      plan_code: string;
      ceo_count: string;
      coo_count: string;
      over_threshold: boolean;
      seats_used: number;
      seat_limit: number;
    }>(sql`select * from gm_list_orgs()`);
    return {
      items: r.rows.map((o) => ({
        id: o.org_id,
        name: o.name,
        status: o.status,
        planCode: o.plan_code,
        ceoCount: Number(o.ceo_count),
        cooCount: Number(o.coo_count),
        overThreshold: o.over_threshold,
        seatsUsed: o.seats_used,
        seatLimit: o.seat_limit,
      })),
    };
  }

  async plans() {
    const r = await this.context.tx.execute<{ code: string; name: string; seat_limit: number }>(
      sql`select code, name, seat_limit from plans order by seat_limit`,
    );
    return { items: r.rows.map((p) => ({ code: p.code, name: p.name, seatLimit: p.seat_limit })) };
  }

  async createOrg(dto: CreateOrgDto) {
    const email = dto.ceoEmail.trim().toLowerCase();
    const gm = await this.context.tx.execute(sql`
      select 1 from game_masters g join users u on u.id = g.user_id where u.email = ${email} and g.status <> 'removed'`);
    if (gm.rows.length > 0) throw new ConflictException('A gameMaster cannot be the CEO of an organisation.');

    const user = await this.userFor(email, dto.ceoFullName.trim());
    const created = await this.context.tx.execute<{ id: string }>(
      sql`select gm_create_org(${dto.name.trim()}, ${dto.planCode}, ${user.id}::uuid) as id`,
    );
    if (user.created) {
      const link = await this.oneTimeLink(user.id, 'invite', `${INVITE_TTL_DAYS} days`);
      await this.mail.send({
        to: email,
        subject: `Your organisation ${dto.name.trim()} is ready`,
        text: `Set your password to sign in:\n${this.frontend()}/accept-invite?token=${link.token}\n`,
      });
    }
    return { id: created.rows[0].id, ceoInvited: user.created };
  }

  async setBlocked(orgId: string, blocked: boolean, reason?: string) {
    await this.context.tx.execute(
      sql`select gm_set_org_blocked(${orgId}::uuid, ${blocked}, ${reason ?? null})`,
    );
    return { ok: true };
  }

  async setPlan(orgId: string, dto: SetPlanDto) {
    // The database refuses a downgrade while the org uses more seats than the new plan allows.
    await this.context.tx.execute(sql`
      select gm_set_org_plan(${orgId}::uuid, ${dto.planCode}, ${dto.periodEnd ?? null}::timestamptz)`);
    return { ok: true };
  }

  // ---- platform requests ----------------------------------------------
  async listRequests() {
    const r = await this.context.tx.execute<{
      id: string;
      org_id: string;
      org_name: string;
      type: string;
      status: string;
      target_member_id: string;
      new_email: string | null;
      replacement_user_id: string | null;
      created_at: string;
    }>(sql`select id, org_id, org_name, type::text as type, status::text as status, target_member_id,
                  new_email::text as new_email, replacement_user_id, created_at
             from gm_list_platform_requests()`);
    return {
      items: r.rows.map((x) => ({
        id: x.id,
        orgId: x.org_id,
        orgName: x.org_name,
        type: x.type,
        status: x.status,
        newEmail: x.new_email,
        createdAt: iso(x.created_at),
      })),
    };
  }

  /**
   * Called after the gameMaster has checked the person offline. Recovery: the CEO's email
   * becomes the verified new address, old sessions and the old authenticator are dropped, and
   * a one-time password link goes to that address. Passwords are never shared.
   */
  async verify(requestId: string) {
    const tx = this.context.tx;
    const found = await tx.execute<{ type: string; status: string; new_email: string | null; user_id: string | null }>(sql`
      select type, status, new_email, replacement_user_id as user_id
        from gm_list_platform_requests() where id = ${requestId}::uuid`);
    const req = found.rows[0];
    if (!req) throw new NotFoundException('Request not found.');
    if (req.status !== 'pending') throw new ConflictException('This request has already been handled.');

    if (req.type !== 'ceo_recovery') {
      await tx.execute(sql`select gm_verify_platform_request(${requestId}::uuid)`);
      return { ok: true };
    }
    if (!req.user_id || !req.new_email) throw new BadRequestException('The request is incomplete.');

    const link = await this.oneTimeLink(req.user_id, 'ceo_recovery', `${RECOVERY_TTL_HOURS} hours`);
    await tx.execute(sql`
      select gm_verify_platform_request(${requestId}::uuid, ${link.hash}, ${link.expiresAt}::timestamptz)`);
    await tx.execute(sql`
      update users set email = ${req.new_email}, mfa_enabled = false, mfa_secret_enc = null
       where id = ${req.user_id}`);
    await tx.execute(sql`
      update refresh_tokens set revoked_at = now() where user_id = ${req.user_id} and revoked_at is null`);
    await this.mail.send({
      to: req.new_email,
      subject: 'Recover your office-ledger access',
      text: `Set a new password (valid ${RECOVERY_TTL_HOURS} hours):\n${this.frontend()}/accept-invite?token=${link.token}\n`,
    });
    return { ok: true };
  }

  async completeRemoval(requestId: string) {
    await this.context.tx.execute(sql`select gm_complete_remove_last_ceo(${requestId}::uuid)`);
    return { ok: true };
  }

  // ---- gameMasters ----------------------------------------------------
  async listGameMasters() {
    const r = await this.context.tx.execute<{
      user_id: string;
      email: string;
      full_name: string;
      status: string;
      created_by: string | null;
      confirmed_by: string | null;
      created_at: string;
    }>(sql`
      select g.user_id, u.email::text as email, u.full_name, g.status::text as status,
             g.created_by, g.confirmed_by, g.created_at
        from game_masters g join users u on u.id = g.user_id order by g.created_at`);
    return {
      items: r.rows.map((g) => ({
        userId: g.user_id,
        email: g.email,
        fullName: g.full_name,
        status: g.status,
        createdBy: g.created_by,
        confirmedBy: g.confirmed_by,
        createdAt: iso(g.created_at),
      })),
    };
  }

  async createGameMaster(p: HrmsPrincipal, dto: CreateGameMasterDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userFor(email, dto.fullName.trim());
    const existing = await this.context.tx.execute(sql`select 1 from game_masters where user_id = ${user.id}`);
    if (existing.rows.length > 0) throw new ConflictException('This person is already a gameMaster.');
    await this.context.tx.execute(sql`
      insert into game_masters (user_id, created_by) values (${user.id}, ${p.userId})`);
    if (user.created) {
      const link = await this.oneTimeLink(user.id, 'invite', `${INVITE_TTL_DAYS} days`);
      await this.mail.send({
        to: email,
        subject: 'You have been added as a gameMaster',
        text: `Set your password:\n${this.frontend()}/accept-invite?token=${link.token}\nAnother gameMaster must confirm you before you can sign in.\n`,
      });
    }
    return { userId: user.id, status: 'pending_confirmation' };
  }

  /** The database refuses the creator and the person themselves as confirmer. */
  async confirmGameMaster(p: HrmsPrincipal, userId: string) {
    const r = await this.context.tx.execute(sql`
      update game_masters set status = 'active', confirmed_by = ${p.userId}, confirmed_at = now()
       where user_id = ${userId} and status = 'pending_confirmation' returning user_id`);
    if (r.rows.length === 0) throw new NotFoundException('No gameMaster is waiting for confirmation with that id.');
    return { ok: true };
  }

  // ---- org side: recovery and last-CEO removal ------------------------
  async fileRecovery(p: HrmsPrincipal, dto: RecoveryRequestDto) {
    const target = await this.context.tx.execute<{ user_id: string }>(sql`
      select user_id from org_members
       where id = ${dto.targetMemberId} and org_id = current_org_id() and role = 'ceo' and status = 'active'`);
    const userId = target.rows[0]?.user_id;
    if (!userId) throw new NotFoundException('That CEO was not found.');
    // For a recovery, replacement_user_id names the account whose access is restored.
    const r = await this.context.tx.execute<{ id: string }>(sql`
      insert into platform_requests (org_id, type, requested_by, target_member_id, new_email, replacement_user_id)
      values (current_org_id(), 'ceo_recovery', ${p.memberId}, ${dto.targetMemberId},
              ${dto.newEmail.trim().toLowerCase()}, ${userId})
      returning id`);
    return { id: r.rows[0].id, status: 'pending' };
  }

  async fileLastCeoRemoval(p: HrmsPrincipal, dto: LastCeoRemovalDto) {
    const replacement = await this.context.tx.execute<{ user_id: string }>(sql`
      select user_id from org_members
       where id = ${dto.replacementMemberId} and org_id = current_org_id() and status = 'active'
         and role in ('coo', 'manager')`);
    const userId = replacement.rows[0]?.user_id;
    if (!userId) throw new NotFoundException('The replacement must be an active COO or manager of this organisation.');
    const r = await this.context.tx.execute<{ id: string }>(sql`
      insert into platform_requests (org_id, type, requested_by, target_member_id, replacement_user_id)
      values (current_org_id(), 'remove_last_ceo', ${p.memberId}, ${p.memberId}, ${userId})
      returning id`);
    return { id: r.rows[0].id, status: 'pending' };
  }
}
