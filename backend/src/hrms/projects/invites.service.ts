import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsContextService } from '../db/hrms-context';
import { iso } from '../hrms-rows';
import type { DeclineInviteDto, ReviewInviteDto, SendInviteDto } from './dto/projects.dto';

interface InviteRow extends Record<string, unknown> {
  id: string;
  project_id: string;
  project_name: string;
  role: string;
  status: string;
  decline_reason: string | null;
  review_reason: string | null;
  invited_by: string;
  invited_by_name: string;
  invitee_member_id: string;
  invitee_name: string;
  responded_at: string | null;
  reviewed_at: string | null;
  expires_at: string;
  created_at: string;
}

const INVITE_SELECT = sql`
  select i.id, i.project_id, p.name as project_name, i.role::text as role, i.status::text as status,
         i.decline_reason, i.review_reason,
         i.invited_by, ub.full_name as invited_by_name,
         i.invitee_member_id, ui.full_name as invitee_name,
         i.responded_at, i.reviewed_at, i.expires_at, i.created_at
    from project_invites i
    join projects p on p.id = i.project_id
    join org_members mb on mb.id = i.invited_by
    join users ub on ub.id = mb.user_id
    join org_members mi on mi.id = i.invitee_member_id
    join users ui on ui.id = mi.user_id`;

function toInvite(r: InviteRow) {
  return {
    id: r.id,
    project: { id: r.project_id, name: r.project_name },
    role: r.role,
    status: r.status,
    declineReason: r.decline_reason,
    reviewReason: r.review_reason,
    invitedBy: { id: r.invited_by, fullName: r.invited_by_name },
    invitee: { id: r.invitee_member_id, fullName: r.invitee_name },
    respondedAt: iso(r.responded_at),
    reviewedAt: iso(r.reviewed_at),
    expiresAt: iso(r.expires_at),
    createdAt: iso(r.created_at),
  };
}

@Injectable()
export class InvitesService {
  constructor(private readonly context: HrmsContextService) {}

  async send(p: HrmsPrincipal, projectId: string, dto: SendInviteDto) {
    const target = await this.context.tx.execute<{ role: string }>(
      sql`select role::text as role from org_members
           where id = ${dto.memberId} and org_id = current_org_id() and status = 'active'`,
    );
    const role = target.rows[0]?.role;
    if (!role) throw new NotFoundException('Member not found.');
    if (role !== 'manager' && role !== 'employee') {
      throw new BadRequestException('Only managers and employees can be invited to a project.');
    }

    // The database sets the expiry (working days), checks the role, that the person is not
    // already on the project, and that a manager has an approved request.
    const created = await this.context.tx.execute<{ id: string }>(sql`
      insert into project_invites (org_id, project_id, invitee_member_id, role, invited_by, request_id, expires_at)
      values (current_org_id(), ${projectId}, ${dto.memberId}, ${role}::project_role, ${p.memberId},
              ${dto.requestId ?? null}, now())
      returning id`);
    return this.get(created.rows[0].id);
  }

  /** Invites sent to me, and declined invites I sent that wait for my review. */
  async mine(p: HrmsPrincipal) {
    const tx = this.context.tx;
    const received = await tx.execute<InviteRow>(sql`
      ${INVITE_SELECT}
       where i.org_id = current_org_id() and i.invitee_member_id = ${p.memberId}
       order by i.created_at desc limit 100`);
    const toReview = await tx.execute<InviteRow>(sql`
      ${INVITE_SELECT}
       where i.org_id = current_org_id() and i.invited_by = ${p.memberId} and i.status = 'declined'
       order by i.responded_at desc nulls last limit 100`);
    return { received: received.rows.map(toInvite), toReview: toReview.rows.map(toInvite) };
  }

  async accept(id: string) {
    await this.requireExists(id);
    await this.context.tx.execute(sql`
      update project_invites set status = 'accepted' where id = ${id} and org_id = current_org_id()`);
    return this.get(id);
  }

  async decline(id: string, dto: DeclineInviteDto) {
    if (dto.reason.trim().length === 0) {
      throw new BadRequestException('A reason is required to decline an invite.');
    }
    await this.requireExists(id);
    await this.context.tx.execute(sql`
      update project_invites set status = 'declined', decline_reason = ${dto.reason.trim()}
       where id = ${id} and org_id = current_org_id()`);
    return this.get(id);
  }

  /** Only the sender can do this: the database refuses anyone else. */
  async review(id: string, dto: ReviewInviteDto) {
    const reason = dto.reason?.trim() ?? '';
    if (dto.decision === 'overrule' && reason.length === 0) {
      throw new BadRequestException('A reason is required to overrule a decline.');
    }
    await this.requireExists(id);
    await this.context.tx.execute(
      dto.decision === 'accept'
        ? sql`update project_invites set status = 'decline_accepted'
               where id = ${id} and org_id = current_org_id()`
        : sql`update project_invites set status = 'overruled', review_reason = ${reason}
               where id = ${id} and org_id = current_org_id()`,
    );
    return this.get(id);
  }

  // An invite past its window is dead even before the expiry job has marked it.
  private async requireExists(id: string): Promise<void> {
    const r = await this.context.tx.execute<{ past: boolean; status: string }>(sql`
      select (expires_at < now()) as past, status::text as status
        from project_invites where id = ${id} and org_id = current_org_id()`);
    if (r.rows.length === 0) throw new NotFoundException('Invite not found.');
    const { past, status } = r.rows[0];
    if (status === 'expired' || (past && (status === 'pending' || status === 'declined'))) {
      throw new ConflictException('This invite has expired.');
    }
  }

  private async get(id: string) {
    const r = await this.context.tx.execute<InviteRow>(sql`
      ${INVITE_SELECT} where i.id = ${id} and i.org_id = current_org_id()`);
    if (!r.rows[0]) throw new NotFoundException('Invite not found.');
    return toInvite(r.rows[0]);
  }
}
