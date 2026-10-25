import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { isIP } from 'node:net';
import { HrmsContextService } from '../db/hrms-context';
import { iso } from '../hrms-rows';
import type {
  CreateHolidayDto,
  CreateLeaveTypeDto,
  CreateOfficeNetworkDto,
  UpdateLeaveTypeDto,
  UpdateOrgSettingsDto,
} from './dto/org.dto';

function invalidCidr(error: unknown): boolean {
  let cause = error;
  for (let depth = 0; depth < 5 && cause && typeof cause === 'object'; depth += 1) {
    const pg = cause as { code?: string; message?: string; cause?: unknown };
    if (pg.code === '22P02' && /cidr/i.test(pg.message ?? '')) return true;
    cause = pg.cause;
  }
  return false;
}

// camelCase DTO field -> org_settings column. This is the whole list of what a CEO may change.
const SETTINGS_COLUMNS: Record<keyof UpdateOrgSettingsDto, string> = {
  timezone: 'timezone',
  workStartTime: 'work_start_time',
  lateGraceMinutes: 'late_grace_minutes',
  weekendDays: 'weekend_days',
  requestExpiryWorkingDays: 'request_expiry_working_days',
  workloadAmberTasks: 'workload_amber_tasks',
  workloadAmberProjects: 'workload_amber_projects',
  workloadRedTasks: 'workload_red_tasks',
  workloadRedProjects: 'workload_red_projects',
  weightAttendance: 'weight_attendance',
  weightRating: 'weight_rating',
  weightOntime: 'weight_ontime',
  weightLeave: 'weight_leave',
  pointsLate: 'points_late',
  pointsMissingCheckout: 'points_missing_checkout',
  pointsUnpaidLeave: 'points_unpaid_leave',
  ratingMinCount: 'rating_min_count',
  ratingPriorWeight: 'rating_prior_weight',
  ratingWindowDays: 'rating_window_days',
  highUrgencyReminderHours: 'high_urgency_reminder_hours',
};

interface SettingsRow extends Record<string, unknown> {
  timezone: string;
  work_start_time: string;
  late_grace_minutes: number;
  weekend_days: number[];
  request_expiry_working_days: number;
  workload_amber_tasks: number;
  workload_amber_projects: number;
  workload_red_tasks: number;
  workload_red_projects: number;
  weight_attendance: number;
  weight_rating: number;
  weight_ontime: number;
  weight_leave: number;
  points_late: string;
  points_missing_checkout: string;
  points_unpaid_leave: string;
  rating_min_count: number;
  rating_prior_weight: number;
  rating_window_days: number;
  high_urgency_reminder_hours: number;
}

export interface SeatUsage {
  planCode: string;
  seatLimit: number;
  seatsUsed: number;
  percentUsed: number;
  /** 80, 95 or 100 once that share of the seats is used; otherwise null. */
  warningLevel: 80 | 95 | 100 | null;
}

const SETTINGS_SELECT = sql`
  select timezone, to_char(work_start_time, 'HH24:MI') as work_start_time, late_grace_minutes,
         weekend_days, request_expiry_working_days, workload_amber_tasks, workload_amber_projects,
         workload_red_tasks, workload_red_projects, weight_attendance, weight_rating, weight_ontime, weight_leave,
         points_late::text, points_missing_checkout::text, points_unpaid_leave::text,
         rating_min_count, rating_prior_weight, rating_window_days, high_urgency_reminder_hours
    from org_settings where org_id = current_org_id()`;

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class OrgService {
  constructor(private readonly context: HrmsContextService) {}

  async get(includeSeats: boolean) {
    const tx = this.context.tx;
    const org = await tx.execute<{ id: string; name: string; plan_code: string; status: string }>(
      sql`select id, name, plan_code, status::text from orgs where id = current_org_id()`,
    );
    if (!org.rows[0]) throw new NotFoundException('Organisation not found.');

    return {
      id: org.rows[0].id,
      name: org.rows[0].name,
      status: org.rows[0].status,
      settings: await this.readSettings(),
      ...(includeSeats ? { seats: await this.seatUsage() } : {}),
    };
  }

  async seatUsage(): Promise<SeatUsage> {
    const result = await this.context.tx.execute<{
      plan_code: string;
      seat_limit: number;
      seats_used: number;
      percent_used: string;
      warning_level: number | null;
    }>(sql`select plan_code, seat_limit, seats_used, percent_used::text, warning_level
             from v_org_seat_usage where org_id = current_org_id()`);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Organisation not found.');
    return {
      planCode: row.plan_code,
      seatLimit: row.seat_limit,
      seatsUsed: row.seats_used,
      percentUsed: Number(row.percent_used),
      warningLevel: row.warning_level as SeatUsage['warningLevel'],
    };
  }

  async updateSettings(dto: UpdateOrgSettingsDto) {
    const entries = (Object.keys(SETTINGS_COLUMNS) as Array<keyof UpdateOrgSettingsDto>)
      .filter((key) => dto[key] !== undefined)
      .map((key) => [key, dto[key]] as const);
    if (entries.length === 0) throw new BadRequestException('Nothing to change.');
    if (dto.timezone !== undefined && !isValidTimeZone(dto.timezone)) {
      const message = 'Choose a valid IANA time zone.';
      throw new BadRequestException({ message, errors: { timezone: [message] } });
    }

    const constraintKeys = [
      'workloadAmberTasks',
      'workloadAmberProjects',
      'workloadRedTasks',
      'workloadRedProjects',
      'weightAttendance',
      'weightRating',
      'weightOntime',
      'weightLeave',
    ] as const;
    if (constraintKeys.some((key) => dto[key] !== undefined)) {
      const current = await this.readSettings();
      const amberTasks = dto.workloadAmberTasks ?? current.workloadAmberTasks;
      const amberProjects = dto.workloadAmberProjects ?? current.workloadAmberProjects;
      if ((dto.workloadRedTasks ?? current.workloadRedTasks) <= amberTasks) {
        const message = 'Red task threshold must be greater than the amber task threshold.';
        const field =
          dto.workloadRedTasks !== undefined ? 'workloadRedTasks' : 'workloadAmberTasks';
        throw new BadRequestException({ message, errors: { [field]: [message] } });
      }
      if ((dto.workloadRedProjects ?? current.workloadRedProjects) <= amberProjects) {
        const message = 'Red project threshold must be greater than the amber project threshold.';
        const field =
          dto.workloadRedProjects !== undefined ? 'workloadRedProjects' : 'workloadAmberProjects';
        throw new BadRequestException({ message, errors: { [field]: [message] } });
      }

      const weights = [
        dto.weightAttendance ?? current.weightAttendance,
        dto.weightRating ?? current.weightRating,
        dto.weightOntime ?? current.weightOntime,
        dto.weightLeave ?? current.weightLeave,
      ];
      if (weights.reduce((sum, value) => sum + value, 0) !== 100) {
        const message = 'Performance score weights must total exactly 100%.';
        throw new BadRequestException({
          message,
          errors: {
            weightAttendance: [message],
            weightRating: [message],
            weightOntime: [message],
            weightLeave: [message],
          },
        });
      }
    }

    const assignments: SQL[] = entries.map(([key, value]) => {
      const column = sql.identifier(SETTINGS_COLUMNS[key]);
      if (key === 'weekendDays') {
        return sql`${column} = ${sql.raw(`ARRAY[${(value as number[]).map(Number).join(',')}]::smallint[]`)}`;
      }
      if (key === 'workStartTime') return sql`${column} = ${value as string}::time`;
      return sql`${column} = ${value as number | string}`;
    });

    await this.context.tx.execute(
      sql`update org_settings set ${sql.join(assignments, sql`, `)} where org_id = current_org_id()`,
    );
    return this.readSettings();
  }

  private async readSettings() {
    const result = await this.context.tx.execute<SettingsRow>(SETTINGS_SELECT);
    const r = result.rows[0];
    if (!r) throw new NotFoundException('Organisation settings not found.');
    return {
      timezone: r.timezone,
      workStartTime: r.work_start_time,
      lateGraceMinutes: r.late_grace_minutes,
      weekendDays: r.weekend_days,
      requestExpiryWorkingDays: r.request_expiry_working_days,
      workloadAmberTasks: r.workload_amber_tasks,
      workloadAmberProjects: r.workload_amber_projects,
      workloadRedTasks: r.workload_red_tasks,
      workloadRedProjects: r.workload_red_projects,
      weightAttendance: r.weight_attendance,
      weightRating: r.weight_rating,
      weightOntime: r.weight_ontime,
      weightLeave: r.weight_leave,
      pointsLate: Number(r.points_late),
      pointsMissingCheckout: Number(r.points_missing_checkout),
      pointsUnpaidLeave: Number(r.points_unpaid_leave),
      ratingMinCount: r.rating_min_count,
      ratingPriorWeight: r.rating_prior_weight,
      ratingWindowDays: r.rating_window_days,
      highUrgencyReminderHours: r.high_urgency_reminder_hours,
    };
  }

  // ---- office networks ------------------------------------------------
  async listNetworks() {
    const r = await this.context.tx.execute<{
      id: string;
      network: string;
      label: string | null;
      created_at: string;
    }>(
      sql`select id, network::text, label, created_at from org_office_networks
           where org_id = current_org_id() order by network`,
    );
    return {
      items: r.rows.map((n) => ({
        id: n.id,
        network: n.network,
        label: n.label,
        createdAt: iso(n.created_at),
      })),
    };
  }

  async addNetwork(dto: CreateOfficeNetworkDto) {
    const [address, prefix, ...extra] = dto.network.split('/');
    const version = isIP(address);
    const prefixNumber = prefix === undefined ? null : Number(prefix);
    if (
      version === 0 ||
      extra.length > 0 ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) || prefixNumber! > (version === 4 ? 32 : 128)))
    ) {
      const message = 'Enter a valid IP address and CIDR prefix.';
      throw new BadRequestException({ message, errors: { network: [message] } });
    }

    let r;
    try {
      r = await this.context.tx.execute<{
        id: string;
        network: string;
        label: string | null;
        created_at: string;
      }>(sql`insert into org_office_networks (org_id, network, label)
          values (current_org_id(), ${dto.network}::cidr, ${dto.label ?? null})
          returning id, network::text, label, created_at`);
    } catch (error) {
      if (invalidCidr(error)) {
        const message = 'Enter a network address that matches its CIDR prefix.';
        throw new BadRequestException({ message, errors: { network: [message] } });
      }
      throw error;
    }
    const n = r.rows[0];
    return { id: n.id, network: n.network, label: n.label, createdAt: iso(n.created_at) };
  }

  async removeNetwork(id: string): Promise<void> {
    const r = await this.context.tx.execute(
      sql`delete from org_office_networks where id = ${id} and org_id = current_org_id() returning id`,
    );
    if (r.rows.length === 0) throw new NotFoundException('Office network not found.');
  }

  // ---- holidays -------------------------------------------------------
  async listHolidays(year?: number) {
    const r = await this.context.tx.execute<{ holiday_date: string; name: string }>(
      year === undefined
        ? sql`select to_char(holiday_date, 'YYYY-MM-DD') as holiday_date, name from org_holidays
               where org_id = current_org_id() order by holiday_date`
        : sql`select to_char(holiday_date, 'YYYY-MM-DD') as holiday_date, name from org_holidays
               where org_id = current_org_id() and extract(year from holiday_date) = ${year}
               order by holiday_date`,
    );
    return { items: r.rows.map((h) => ({ date: h.holiday_date, name: h.name })) };
  }

  async addHoliday(dto: CreateHolidayDto) {
    const r = await this.context.tx.execute<{ holiday_date: string; name: string }>(
      sql`insert into org_holidays (org_id, holiday_date, name)
          values (current_org_id(), ${dto.date}::date, ${dto.name})
          returning to_char(holiday_date, 'YYYY-MM-DD') as holiday_date, name`,
    );
    return { date: r.rows[0].holiday_date, name: r.rows[0].name };
  }

  async removeHoliday(date: string): Promise<void> {
    const r = await this.context.tx.execute(
      sql`delete from org_holidays where org_id = current_org_id() and holiday_date = ${date}::date returning 1`,
    );
    if (r.rows.length === 0) throw new NotFoundException('Holiday not found.');
  }

  // ---- leave types ----------------------------------------------------
  async listLeaveTypes() {
    const r = await this.context.tx.execute<LeaveTypeRow>(
      sql`select id, code, name, yearly_allowance_days::text, is_paid, is_active
            from leave_types where org_id = current_org_id() order by name`,
    );
    return { items: r.rows.map(toLeaveType) };
  }

  async createLeaveType(dto: CreateLeaveTypeDto) {
    const r = await this.context.tx.execute<LeaveTypeRow>(
      sql`insert into leave_types (org_id, code, name, yearly_allowance_days, is_paid)
          values (current_org_id(), ${dto.code}, ${dto.name}, ${dto.yearlyAllowanceDays}, ${dto.isPaid})
          returning id, code, name, yearly_allowance_days::text, is_paid, is_active`,
    );
    return toLeaveType(r.rows[0]);
  }

  async updateLeaveType(id: string, dto: UpdateLeaveTypeDto) {
    const sets: SQL[] = [];
    if (dto.name !== undefined) sets.push(sql`name = ${dto.name}`);
    if (dto.yearlyAllowanceDays !== undefined) {
      sets.push(sql`yearly_allowance_days = ${dto.yearlyAllowanceDays}`);
    }
    if (dto.isPaid !== undefined) sets.push(sql`is_paid = ${dto.isPaid}`);
    if (dto.isActive !== undefined) sets.push(sql`is_active = ${dto.isActive}`);
    if (sets.length === 0) throw new BadRequestException('Nothing to change.');

    const r = await this.context.tx.execute<LeaveTypeRow>(
      sql`update leave_types set ${sql.join(sets, sql`, `)}
           where id = ${id} and org_id = current_org_id()
           returning id, code, name, yearly_allowance_days::text, is_paid, is_active`,
    );
    if (!r.rows[0]) throw new NotFoundException('Leave type not found.');
    return toLeaveType(r.rows[0]);
  }
}

interface LeaveTypeRow extends Record<string, unknown> {
  id: string;
  code: string;
  name: string;
  yearly_allowance_days: string;
  is_paid: boolean;
  is_active: boolean;
}

function toLeaveType(r: LeaveTypeRow) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    yearlyAllowanceDays: Number(r.yearly_allowance_days),
    isPaid: r.is_paid,
    isActive: r.is_active,
  };
}
