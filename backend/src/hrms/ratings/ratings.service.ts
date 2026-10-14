import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsContextService } from '../db/hrms-context';
import { iso } from '../hrms-rows';
import type { SubmitRatingsDto } from './dto/ratings.dto';

interface DueRow extends Record<string, unknown> {
  project_id: string;
  project_name: string;
  completed_at: string;
  rating_closes_at: string;
  member_id: string;
  full_name: string;
  role: string;
  rated: boolean;
}

interface ScoreRow extends Record<string, unknown> {
  member_id: string;
  full_name: string;
  role: string;
  computed_on: string;
  final_score: string | null;
  band: string | null;
  is_new: boolean;
  has_ratings: boolean;
  change_vs_prev_30d: string | null;
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));

@Injectable()
export class RatingsService {
  constructor(private readonly context: HrmsContextService) {}

  /**
   * Completed projects still inside the rating window, where the caller was on the project at
   * completion. The other side only: employees rate managers, managers rate employees. The
   * database never lets the app read ratings, so "already rated" comes from my_given_ratings().
   */
  async due(p: HrmsPrincipal) {
    const rows = await this.context.tx.execute<DueRow>(sql`
      select pr.id as project_id, pr.name as project_name, pr.completed_at, pr.rating_closes_at,
             other.member_id, u.full_name, other.role::text as role,
             exists (select 1 from my_given_ratings(pr.id) g where g.ratee_member_id = other.member_id) as rated
        from projects pr
        join project_members mine on mine.project_id = pr.id and mine.member_id = ${p.memberId}
             and mine.added_at <= pr.completed_at and (mine.removed_at is null or mine.removed_at > pr.completed_at)
        join project_members other on other.project_id = pr.id and other.role <> mine.role
             and other.member_id <> mine.member_id
             and other.added_at <= pr.completed_at and (other.removed_at is null or other.removed_at > pr.completed_at)
        join org_members om on om.id = other.member_id
        join users u on u.id = om.user_id
       where pr.org_id = current_org_id() and pr.completed_at is not null and now() <= pr.rating_closes_at
         and mine.role in ('manager', 'employee')
       order by pr.rating_closes_at, pr.name, u.full_name`);

    const projects = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        completedAt: string | null;
        closesAt: string | null;
        ratees: Array<{ memberId: string; fullName: string; role: string }>;
      }
    >();
    for (const r of rows.rows) {
      if (r.rated) continue;
      const entry = projects.get(r.project_id) ?? {
        projectId: r.project_id,
        projectName: r.project_name,
        completedAt: iso(r.completed_at),
        closesAt: iso(r.rating_closes_at),
        ratees: [],
      };
      entry.ratees.push({ memberId: r.member_id, fullName: r.full_name, role: r.role });
      projects.set(r.project_id, entry);
    }
    return { items: [...projects.values()] };
  }

  async submit(p: HrmsPrincipal, projectId: string, dto: SubmitRatingsDto) {
    const tx = this.context.tx;
    const seen = new Set<string>();
    for (const r of dto.ratings) {
      if (seen.has(r.rateeId)) throw new BadRequestException('Each person can be rated once.');
      seen.add(r.rateeId);
      if (r.stars <= 2 && (r.comment?.trim().length ?? 0) === 0) {
        throw new BadRequestException('A comment is required for 1 or 2 stars.');
      }
    }
    const exists = await tx.execute(
      sql`select 1 from projects where id = ${projectId} and org_id = current_org_id()`,
    );
    if (exists.rows.length === 0) throw new NotFoundException('Project not found.');

    const given = await tx.execute<{ ratee_member_id: string }>(
      sql`select ratee_member_id from my_given_ratings(${projectId})`,
    );
    if (given.rows.some((g) => seen.has(g.ratee_member_id))) {
      throw new ConflictException('You have already rated one of these people on this project.');
    }

    // The database checks the window, that both people were on the project at completion,
    // and that the two are on opposite sides.
    for (const r of dto.ratings) {
      await tx.execute(sql`
        insert into project_ratings (org_id, project_id, rater_member_id, ratee_member_id, stars, comment)
        values (current_org_id(), ${projectId}, ${p.memberId}, ${r.rateeId}, ${r.stars}, ${r.comment?.trim() || null})`);
    }
    return { submitted: dto.ratings.length };
  }

  async list(_p: HrmsPrincipal) {
    const rows = await this.context.tx.execute<ScoreRow>(sql`
      select d.member_id, u.full_name, m.role::text as role, d.computed_on::text as computed_on,
             d.final_score::text as final_score, d.band::text as band, d.is_new, d.has_ratings,
             d.change_vs_prev_30d::text as change_vs_prev_30d
        from v_performance_dashboard d
        join org_members m on m.id = d.member_id
        join users u on u.id = m.user_id
       where d.org_id = current_org_id() and m.status = 'active'
       order by d.final_score desc nulls last, u.full_name`);
    return {
      items: rows.rows.map((r) => ({
        memberId: r.member_id,
        fullName: r.full_name,
        role: r.role,
        computedOn: r.computed_on,
        score: num(r.final_score),
        band: r.band,
        isNew: r.is_new,
        hasRatings: r.has_ratings,
        trend: this.trend(num(r.change_vs_prev_30d)),
        changeVsPrev30d: num(r.change_vs_prev_30d),
      })),
    };
  }

  async breakdown(memberId: string) {
    const tx = this.context.tx;
    const latest = await tx.execute<Record<string, string | boolean | number | null>>(sql`
      select s.computed_on::text as computed_on, s.window_start::text as window_start,
             s.working_days::text as working_days, s.attendance_points::text as attendance_points,
             s.attendance_score::text as attendance_score, s.rating_count, s.rating_avg::text as rating_avg,
             s.rating_score::text as rating_score, s.ontime_total, s.ontime_on_time,
             s.ontime_score::text as ontime_score, s.final_score::text as final_score, s.band::text as band,
             s.is_new, s.has_ratings, s.early_tasks, u.full_name, m.role::text as role,
             st.weight_attendance::text as weight_attendance, st.weight_rating::text as weight_rating,
             st.weight_ontime::text as weight_ontime
        from performance_scores s
        join org_members m on m.id = s.member_id
        join users u on u.id = m.user_id
        join org_settings st on st.org_id = s.org_id
       where s.member_id = ${memberId} and s.org_id = current_org_id()
       order by s.computed_on desc limit 1`);
    const row = latest.rows[0];
    if (!row) throw new NotFoundException('No score has been computed for this person yet.');

    const history = await tx.execute<{
      computed_on: string;
      final_score: string | null;
      band: string | null;
    }>(sql`
      select computed_on::text as computed_on, final_score::text as final_score, band::text as band
        from performance_scores where member_id = ${memberId} and org_id = current_org_id()
       order by computed_on desc limit 12`);
    const summary = await tx.execute<{ rating_count: string; rating_avg: string }>(sql`
      select rating_count::text, rating_avg::text from v_rating_summary where member_id = ${memberId}`);

    return {
      memberId,
      fullName: row.full_name,
      role: row.role,
      computedOn: row.computed_on,
      windowStart: row.window_start,
      score: num(row.final_score as string | null),
      band: row.band,
      isNew: row.is_new,
      hasRatings: row.has_ratings,
      attendance: {
        score: num(row.attendance_score as string | null),
        points: num(row.attendance_points as string | null),
        workingDays: num(row.working_days as string | null),
        weight: num(row.weight_attendance as string | null),
      },
      ratings: {
        score: num(row.rating_score as string | null),
        average: num(row.rating_avg as string | null),
        count: row.rating_count,
        weight: num(row.weight_rating as string | null),
        // Averages appear only once the org's minimum number of ratings is reached.
        summary: summary.rows[0]
          ? {
              count: Number(summary.rows[0].rating_count),
              average: Number(summary.rows[0].rating_avg),
            }
          : null,
      },
      onTime: {
        score: num(row.ontime_score as string | null),
        done: row.ontime_on_time,
        total: row.ontime_total,
        weight: num(row.weight_ontime as string | null),
      },
      // +1 point each for tasks finished before their deadline (already in the score, capped at 100).
      earlyBonus: { tasks: row.early_tasks as number },
      history: history.rows.map((h) => ({
        computedOn: h.computed_on,
        score: num(h.final_score),
        band: h.band,
      })),
    };
  }

  private trend(change: number | null): 'up' | 'down' | 'flat' | null {
    if (change === null) return null;
    if (change > 0.5) return 'up';
    if (change < -0.5) return 'down';
    return 'flat';
  }
}
