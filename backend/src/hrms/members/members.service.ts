import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql, type SQL } from 'drizzle-orm';
import { generateTempPassword, hashPassword } from '../../common/utils/passwords';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { MailService } from '../mail/mail.service';
import { HrmsContextService } from '../db/hrms-context';
import { iso } from '../hrms-rows';
import type {
  CreateMemberDto,
  ListMembersQueryDto,
  SuspendMembersDto,
  UpdateMemberDto,
} from './dto/members.dto';

const INVITE_TTL_DAYS = 7;
const DEFAULT_PAGE_SIZE = 25;

// Explicit column list: password_hash and mfa_secret_enc are never selected.
const MEMBER_COLUMNS = sql`
  m.id, m.user_id, u.full_name, u.email::text as email, u.phone, u.timezone,
  m.role::text as role, m.status::text as status,
  m.task_approval_required, m.can_view_all_projects,
  m.designation, m.department, m.employee_code,
  m.joined_at, m.last_active_at, m.suspended_at, m.deactivated_at`;

interface MemberRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  timezone: string;
  role: string;
  status: string;
  task_approval_required: boolean;
  can_view_all_projects: boolean;
  designation: string | null;
  department: string | null;
  employee_code: string | null;
  joined_at: string;
  last_active_at: string | null;
  suspended_at: string | null;
  deactivated_at: string | null;
}

export function toMember(r: MemberRow) {
  return {
    id: r.id,
    userId: r.user_id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    timezone: r.timezone,
    role: r.role,
    status: r.status,
    taskApprovalRequired: r.task_approval_required,
    canViewAllProjects: r.can_view_all_projects,
    designation: r.designation,
    department: r.department,
    employeeCode: r.employee_code,
    joinedAt: iso(r.joined_at),
    lastActiveAt: iso(r.last_active_at),
    suspendedAt: iso(r.suspended_at),
    deactivatedAt: iso(r.deactivated_at),
  };
}

function isCeoOrCoo(p: HrmsPrincipal): boolean {
  return p.role === 'ceo' || p.role === 'coo';
}

@Injectable()
export class MembersService {
  constructor(
    private readonly context: HrmsContextService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  /**
   * Who the caller may see: CEO and COO everyone in the org (row-level security keeps this
   * to one org), a manager the people on projects they manage, anyone themselves.
   */
  private visibleTo(p: HrmsPrincipal): SQL {
    if (isCeoOrCoo(p)) return sql`true`;
    if (p.role === 'manager') {
      return sql`(m.id = ${p.memberId} or exists (
        select 1 from project_members a
          join project_members b on b.project_id = a.project_id and b.org_id = a.org_id
         where a.member_id = ${p.memberId} and a.role = 'manager' and a.removed_at is null
           and b.member_id = m.id and b.removed_at is null))`;
    }
    return sql`m.id = ${p.memberId}`;
  }

  async list(p: HrmsPrincipal, query: ListMembersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const filters: SQL[] = [sql`m.org_id = current_org_id()`, this.visibleTo(p)];
    if (query.role) filters.push(sql`m.role = ${query.role}::member_role`);
    if (query.status) filters.push(sql`m.status = ${query.status}::member_status`);
    if (query.q) {
      const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      filters.push(sql`(u.full_name ilike ${like} or u.email::text ilike ${like})`);
    }
    const where = sql.join(filters, sql` and `);

    const tx = this.context.tx;
    const total = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n from org_members m join users u on u.id = m.user_id where ${where}`,
    );
    const rows = await tx.execute<MemberRow>(sql`
      select ${MEMBER_COLUMNS}
        from org_members m join users u on u.id = m.user_id
       where ${where}
       order by u.full_name, m.id
       limit ${pageSize} offset ${(page - 1) * pageSize}`);

    return { items: rows.rows.map(toMember), page, pageSize, total: total.rows[0].n };
  }

  async get(p: HrmsPrincipal, id: string) {
    const row = await this.find(p, id);
    if (!row) throw new NotFoundException('Member not found.');
    return toMember(row);
  }

  private async find(p: HrmsPrincipal, id: string): Promise<MemberRow | undefined> {
    const rows = await this.context.tx.execute<MemberRow>(sql`
      select ${MEMBER_COLUMNS}
        from org_members m join users u on u.id = m.user_id
       where m.id = ${id} and m.org_id = current_org_id() and ${this.visibleTo(p)}`);
    return rows.rows[0];
  }

  /**
   * `issuePassword`: a new account gets a one-time temporary password, returned once to the
   * person adding them (who hands it over); they must choose their own at first sign-in. A
   * request that was approved elsewhere cannot hand it over, so it keeps the emailed invite link.
   */
  async create(p: HrmsPrincipal, dto: CreateMemberDto, options: { issuePassword?: boolean } = {}) {
    const issuePassword = options.issuePassword ?? true;
    if ((dto.role === 'ceo' || dto.role === 'coo') && p.role !== 'ceo') {
      throw new ForbiddenException('Only a CEO can add CEOs and COOs.');
    }
    const tx = this.context.tx;
    const email = dto.email.trim().toLowerCase();

    const existing = await tx.execute<{ id: string }>(
      sql`select id from users where email = ${email}`,
    );
    let userId = existing.rows[0]?.id;
    let inviteToken: string | null = null;
    let temporaryPassword: string | undefined;

    if (userId) {
      const gm = await tx.execute(
        sql`select 1 from game_masters where user_id = ${userId} and status <> 'removed'`,
      );
      if (gm.rows.length > 0) {
        throw new ConflictException('A gameMaster cannot be a member of an organisation.');
      }
      const already = await tx.execute(
        sql`select 1 from org_members where user_id = ${userId} and org_id = current_org_id()`,
      );
      if (already.rows.length > 0) {
        throw new ConflictException('This person is already a member of this organisation.');
      }
    } else {
      if (issuePassword) {
        temporaryPassword = generateTempPassword();
        const hash = await hashPassword(temporaryPassword);
        const created = await tx.execute<{ id: string }>(sql`
          insert into users (email, password_hash, full_name, must_change_password, email_verified_at)
          values (${email}, ${hash}, ${dto.fullName.trim()}, true, now()) returning id`);
        userId = created.rows[0].id;
      } else {
        // The account cannot be signed into until the person sets a password from the invite.
        const unusableHash = await hashPassword(randomBytes(32).toString('base64url'));
        const created = await tx.execute<{ id: string }>(sql`
          insert into users (email, password_hash, full_name)
          values (${email}, ${unusableHash}, ${dto.fullName.trim()}) returning id`);
        userId = created.rows[0].id;

        inviteToken = randomBytes(32).toString('base64url');
        await tx.execute(sql`
          insert into password_resets (user_id, purpose, token_hash, expires_at)
          values (${userId}, 'invite', ${createHash('sha256').update(inviteToken).digest('hex')},
                  now() + ${`${INVITE_TTL_DAYS} days`}::interval)`);
      }
    }

    // Every new person gets the next code (EMP-0001, EMP-0002, ...). The lock makes two
    // people added at the same moment take different numbers; the database keeps codes unique.
    let employeeCode = dto.employeeCode?.trim() || null;
    if (!employeeCode) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('employee_code'), hashtext(current_org_id()::text))`,
      );
      const next = await tx.execute<{ n: number }>(sql`
        select coalesce(max(substring(employee_code from '^EMP-([0-9]+)$')::int), 0) + 1 as n
          from org_members where org_id = current_org_id()`);
      employeeCode = `EMP-${String(next.rows[0].n).padStart(4, '0')}`;
    }

    const inserted = await tx.execute<{ id: string }>(sql`
      insert into org_members (org_id, user_id, role, designation, department, employee_code)
      values (current_org_id(), ${userId}, ${dto.role}::member_role,
              ${dto.designation ?? null}, ${dto.department ?? null}, ${employeeCode})
      returning id`);

    // The invite link is a one-time password-setting link. It is never returned by the API
    // (that would let the creator sign in as the new person); it goes to the person by email.
    if (inviteToken) {
      const base = (this.config.get<string>('FRONTEND_URL') ?? '').split(',')[0].trim();
      await this.mail.send({
        to: email,
        subject: 'You have been invited to office-ledger',
        text: `Set your password to join:\n${base}/accept-invite?token=${inviteToken}\n`,
      });
    }

    const member = await this.find(p, inserted.rows[0].id);
    return {
      member: member ? toMember(member) : null,
      attached: inviteToken === null && temporaryPassword === undefined,
      invited: inviteToken !== null,
      temporaryPassword,
    };
  }

  async update(p: HrmsPrincipal, id: string, dto: UpdateMemberDto) {
    const target = await this.find(p, id);
    if (!target) throw new NotFoundException('Member not found.');
    const self = target.id === p.memberId;

    const wantsRoleOrSwitch =
      dto.role !== undefined ||
      dto.taskApprovalRequired !== undefined ||
      dto.canViewAllProjects !== undefined;
    if (wantsRoleOrSwitch && !isCeoOrCoo(p)) {
      throw new ForbiddenException('Only a CEO or COO can change roles and approval switches.');
    }
    if ((dto.role === 'ceo' || dto.role === 'coo') && p.role !== 'ceo') {
      throw new ForbiddenException('Only a CEO can make someone a CEO or COO.');
    }
    const wantsUserLevel =
      dto.fullName !== undefined || dto.phone !== undefined || dto.timezone !== undefined;
    if (wantsUserLevel && !self) {
      throw new ForbiddenException(
        'Only the person can change their own name, phone and time zone.',
      );
    }
    if (dto.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: dto.timezone });
      } catch {
        throw new BadRequestException('timezone is not a valid IANA time zone.');
      }
    }

    const tx = this.context.tx;
    const memberSets: SQL[] = [];
    if (dto.designation !== undefined) memberSets.push(sql`designation = ${dto.designation}`);
    if (dto.department !== undefined) memberSets.push(sql`department = ${dto.department}`);
    if (dto.employeeCode !== undefined)
      memberSets.push(sql`employee_code = ${dto.employeeCode || null}`);
    if (dto.role !== undefined) memberSets.push(sql`role = ${dto.role}::member_role`);
    if (dto.taskApprovalRequired !== undefined) {
      memberSets.push(sql`task_approval_required = ${dto.taskApprovalRequired}`);
    }
    if (dto.canViewAllProjects !== undefined) {
      memberSets.push(sql`can_view_all_projects = ${dto.canViewAllProjects}`);
    }
    const userSets: SQL[] = [];
    if (dto.fullName !== undefined) userSets.push(sql`full_name = ${dto.fullName.trim()}`);
    if (dto.phone !== undefined) userSets.push(sql`phone = ${dto.phone || null}`);
    if (dto.timezone !== undefined) userSets.push(sql`timezone = ${dto.timezone}`);

    if (memberSets.length === 0 && userSets.length === 0) {
      throw new BadRequestException('Nothing to change.');
    }
    if (memberSets.length > 0) {
      await tx.execute(sql`update org_members set ${sql.join(memberSets, sql`, `)}
                            where id = ${id} and org_id = current_org_id()`);
    }
    if (userSets.length > 0) {
      await tx.execute(
        sql`update users set ${sql.join(userSets, sql`, `)} where id = ${target.user_id}`,
      );
    }
    return this.get(p, id);
  }

  async deactivate(p: HrmsPrincipal, id: string) {
    const target = await this.find(p, id);
    if (!target) throw new NotFoundException('Member not found.');
    if (target.status === 'deactivated') {
      throw new ConflictException('This member is already deactivated.');
    }
    await this.context.tx.execute(sql`
      update org_members
         set status = 'deactivated', deactivated_at = now(), deactivated_by = ${p.memberId}
       where id = ${id} and org_id = current_org_id()`);
    return this.get(p, id);
  }

  /** CEO or COO turns a person's authenticator off (lost phone). A COO cannot reset a CEO or COO. */
  async resetMfa(p: HrmsPrincipal, id: string): Promise<void> {
    const target = await this.context.tx.execute<{ user_id: string; role: string }>(sql`
      select user_id, role::text as role from org_members where id = ${id} and org_id = current_org_id()`);
    const row = target.rows[0];
    if (!row) throw new NotFoundException('Member not found.');
    if (row.role === 'ceo' || (row.role === 'coo' && p.role !== 'ceo')) {
      throw new ForbiddenException(
        'Only a CEO can reset a COO. A CEO turns their own off in their profile.',
      );
    }
    await this.context.runSystem(
      async (tx) => {
        await tx.execute(sql`delete from user_mfa_backup_codes where user_id = ${row.user_id}`);
        await tx.execute(
          sql`update users set mfa_enabled = false, mfa_secret_enc = null where id = ${row.user_id}`,
        );
      },
      { userId: row.user_id },
    );
  }

  /** Bulk suspend for a downgrade. All or nothing (one transaction). */
  async suspend(dto: SuspendMembersDto) {
    const ids = sql.join(
      dto.memberIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const result = await this.context.tx.execute<{ id: string }>(sql`
      update org_members set status = 'suspended', suspended_at = now()
       where id in (${ids}) and org_id = current_org_id()
         and role in ('manager', 'employee') and status = 'active'
       returning id`);
    const suspended = result.rows.map((r) => r.id);
    return {
      suspended,
      skipped: dto.memberIds.filter((id) => !suspended.includes(id)),
    };
  }

  async downgradeCandidates() {
    const r = await this.context.tx.execute<{
      member_id: string;
      full_name: string;
      role: string;
      last_active_at: string | null;
      suggested_order: number;
    }>(sql`select member_id, full_name, role::text as role, last_active_at, suggested_order::int
             from v_downgrade_candidates
            where org_id = current_org_id() order by suggested_order`);
    return {
      items: r.rows.map((c) => ({
        memberId: c.member_id,
        fullName: c.full_name,
        role: c.role,
        lastActiveAt: iso(c.last_active_at),
        suggestedOrder: c.suggested_order,
      })),
    };
  }
}
