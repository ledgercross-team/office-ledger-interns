import type { AuditEntry } from './types';

type Data = Record<string, unknown>;
export type Names = Record<string, string>;
export interface AuditSummary {
  sentence: string;
  /** The entry's own comment, e.g. why a request was rejected. */
  reason: string | null;
  changes: Array<{ label: string; from: string | null; to: string | null }>;
}

const REQUEST_TYPES: Record<string, string> = {
  create_user: 'new member',
  create_project: 'new project',
  add_to_project: 'add to project',
  create_task: 'new task',
  assign_task: 'task assignment',
  add_and_assign: 'add and assign',
  leave: 'leave',
  leave_change: 'leave change',
  attendance_correction: 'attendance correction',
};
const STATUS_WORDS: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
  pending: 'pending',
  approved: 'approved',
  applied: 'approved and applied',
  rejected: 'rejected',
  expired: 'expired',
};
const FIELD_LABELS: Record<string, string> = {
  full_name: 'Name',
  mfa_enabled: 'Two-step sign-in',
  must_change_password: 'Must change password',
  status: 'Status',
  role: 'Role',
  title: 'Title',
  name: 'Name',
  description: 'Description',
  urgency: 'Urgency',
  due_at: 'Due',
  due_date: 'Due date',
  start_date: 'Start date',
  plan_code: 'Plan',
  designation: 'Designation',
  department: 'Department',
  timezone: 'Time zone',
  phone: 'Phone',
  reason: 'Reason',
  decision_reason: 'Decision comment',
  status_comment: 'Comment',
  blocked_reason: 'Blocked because',
  check_in_at: 'Checked in',
  check_out_at: 'Checked out',
  worked_minutes: 'Minutes worked',
  work_date: 'Date',
  starts_at: 'Starts',
  ends_at: 'Ends',
  days: 'Days',
};
const TABLE_LABELS: Record<string, string> = {
  tasks: 'task',
  task_assignees: 'task assignment',
  projects: 'project',
  project_members: 'project member',
  project_invites: 'project invite',
  project_completion_ticks: 'project completion tick',
  requests: 'request',
  leave_requests: 'leave request',
  leave_types: 'leave type',
  attendance_days: 'attendance day',
  attendance_corrections: 'attendance correction',
  org_members: 'member',
  org_settings: 'organisation settings',
  org_holidays: 'holiday',
  org_office_networks: 'office network',
  orgs: 'organisation',
  users: 'account',
  meetings: 'meeting',
  meeting_invitees: 'meeting invitee',
  subscriptions: 'subscription',
  game_masters: 'gameMaster',
  platform_requests: 'platform request',
  audit_notes: 'note',
};
// Not worth showing as a "change" line: bookkeeping and ids that read as noise.
const HIDDEN = new Set([
  'id',
  'org_id',
  'created_at',
  'updated_at',
  'last_login_at',
  'dedupe_key',
  'expires_at',
  'created_via_request',
  'high_reminder_sent_at',
  'password_hash',
  'email_verified_at',
]);

const humanKey = (k: string) =>
  FIELD_LABELS[k] ??
  k
    .replace(/_id$/, '')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());

function show(key: string, value: unknown, names: Names): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    if (names[value]) return names[value];
    if (key === 'status' && STATUS_WORDS[value]) return STATUS_WORDS[value];
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString();
    }
    return value;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function diff(entry: AuditEntry, names: Names): AuditSummary['changes'] {
  const before = (entry.before ?? {}) as Data;
  const after = (entry.after ?? {}) as Data;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: AuditSummary['changes'] = [];
  for (const k of keys) {
    if (HIDDEN.has(k)) continue;
    if (JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
    // a new row lists only what was filled in; a removal only what it had
    const from = entry.action === 'INSERT' ? null : show(k, before[k], names);
    const to = entry.action === 'DELETE' ? null : show(k, after[k], names);
    if (from === null && to === null) continue;
    out.push({ label: humanKey(k), from, to });
  }
  return out;
}

export function describeAudit(entry: AuditEntry, names: Names): AuditSummary {
  const after = (entry.after ?? entry.before ?? {}) as Data;
  const before = (entry.before ?? {}) as Data;
  const who = entry.actor?.fullName ?? 'The system';
  const n = (v: unknown) => (typeof v === 'string' ? names[v] : undefined);
  const project = n(after.project_id) ?? n(entry.rowId) ?? 'a project';
  const isInsert = entry.action === 'INSERT';
  const statusChanged = before.status !== after.status;
  const removed = !before.removed_at && Boolean(after.removed_at);
  let sentence: string;
  let reason: string | null = null;

  switch (entry.table) {
    case 'tasks': {
      const title = typeof after.title === 'string' ? after.title : 'a task';
      if (isInsert)
        sentence = `${who} created task “${title}”${names[String(after.project_id)] ? ` in ${project}` : ''}`;
      else if (statusChanged) {
        sentence = `${who} moved task “${title}” from ${STATUS_WORDS[String(before.status)] ?? before.status} to ${STATUS_WORDS[String(after.status)] ?? after.status}`;
        reason = (after.blocked_reason ?? after.cancel_reason ?? after.status_comment ?? null) as
          string | null;
      } else sentence = `${who} edited task “${title}”`;
      break;
    }
    case 'task_assignees': {
      const person = n(after.member_id) ?? 'someone';
      const task = n(after.task_id) ?? 'a task';
      sentence =
        removed || entry.action === 'DELETE'
          ? `${who} unassigned ${person} from “${task}”`
          : `${who} assigned ${person} to “${task}”`;
      break;
    }
    case 'projects':
      if (isInsert) sentence = `${who} created project ${after.name}`;
      else if (statusChanged)
        sentence =
          `${who} changed project ${after.name} from ${before.status} to ${after.status}`.replace(
            /_/g,
            ' ',
          );
      else sentence = `${who} edited project ${after.name}`;
      break;
    case 'project_members': {
      const person = n(after.member_id) ?? 'someone';
      if (removed) sentence = `${who} removed ${person} from ${project}`;
      else if (isInsert) sentence = `${who} added ${person} to ${project}`;
      else if (before.is_lead !== after.is_lead)
        sentence = `${who} ${after.is_lead ? 'made' : 'removed'} ${person} ${after.is_lead ? 'lead of' : 'as lead of'} ${project}`;
      else sentence = `${who} updated ${person} on ${project}`;
      break;
    }
    case 'project_invites': {
      const person = n(after.invitee_member_id) ?? 'someone';
      sentence = isInsert
        ? `${who} invited ${person} to ${project}`
        : `Invite for ${person} to ${project} is now ${STATUS_WORDS[String(after.status)] ?? after.status}`;
      reason = (after.decline_reason ?? after.review_reason ?? null) as string | null;
      break;
    }
    case 'requests': {
      const type = REQUEST_TYPES[String(after.type)] ?? String(after.type);
      const by = n(after.requested_by) ?? 'someone';
      if (isInsert) sentence = `${by} submitted a ${type} request`;
      else {
        const decider = n(after.decided_by) ?? who;
        const word = String(after.status);
        sentence =
          word === 'approved' || word === 'applied'
            ? `${decider} approved ${by}’s ${type} request`
            : word === 'rejected'
              ? `${decider} rejected ${by}’s ${type} request`
              : `${by}’s ${type} request is now ${STATUS_WORDS[word] ?? word}`;
        reason = (after.decision_reason ?? null) as string | null;
      }
      break;
    }
    case 'leave_requests':
      sentence = `${n(after.member_id) ?? who} ${isInsert ? 'applied for' : 'updated'} leave${after.start_date ? ` from ${after.start_date} to ${after.end_date}` : ''}`;
      reason = (after.reason ?? null) as string | null;
      break;
    case 'attendance_days':
      sentence = isInsert
        ? `${n(after.member_id) ?? who} checked in`
        : before.check_out_at !== after.check_out_at
          ? `${n(after.member_id) ?? who} checked out`
          : `${who} updated attendance for ${n(after.member_id) ?? 'a member'} on ${after.work_date}`;
      break;
    case 'attendance_corrections':
      sentence = `${n(after.member_id) ?? who} asked for an attendance correction on ${after.work_date}`;
      reason = (after.reason ?? null) as string | null;
      break;
    case 'org_members': {
      const person = n(after.id) ?? n(entry.rowId) ?? 'A member';
      if (isInsert) sentence = `${person} joined as ${after.role}`;
      else if (statusChanged) sentence = `${who} changed ${person} to ${after.status}`;
      else if (before.role !== after.role)
        sentence = `${who} changed ${person}’s role from ${before.role} to ${after.role}`;
      else sentence = `${who} updated ${person}’s membership`;
      break;
    }
    case 'users':
      if (isInsert) sentence = `Account created for ${after.full_name}`;
      else if (before.mfa_enabled !== after.mfa_enabled)
        sentence = `${after.full_name} turned two-step sign-in ${after.mfa_enabled ? 'on' : 'off'}`;
      else if (before.must_change_password === false && after.must_change_password === true)
        sentence = `A new password was issued for ${after.full_name}`;
      else if (before.must_change_password === true && after.must_change_password === false)
        sentence = `${after.full_name} chose a new password`;
      else sentence = `${who} updated the account of ${after.full_name}`;
      break;
    case 'meetings':
      sentence = `${who} ${isInsert ? 'scheduled' : after.cancelled_at ? 'cancelled' : 'updated'} meeting “${after.title}”`;
      break;
    default: {
      const label = TABLE_LABELS[entry.table] ?? entry.table.replace(/_/g, ' ');
      const verb = isInsert ? 'added' : entry.action === 'DELETE' ? 'removed' : 'changed';
      sentence = `${who} ${verb} ${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label}`;
    }
  }
  return { sentence, reason, changes: diff(entry, names) };
}

export const HISTORY_FILTERS: Array<{ label: string; tables: string }> = [
  { label: 'Everything', tables: '' },
  { label: 'Tasks', tables: 'tasks,task_assignees' },
  {
    label: 'Projects',
    tables: 'projects,project_members,project_invites,project_completion_ticks',
  },
  { label: 'Requests and approvals', tables: 'requests,platform_requests' },
  { label: 'Leave', tables: 'leave_requests,leave_types' },
  { label: 'Attendance', tables: 'attendance_days,attendance_corrections' },
  { label: 'People', tables: 'org_members,users' },
  { label: 'Meetings', tables: 'meetings,meeting_invitees' },
  { label: 'Settings', tables: 'org_settings,org_holidays,org_office_networks,orgs,subscriptions' },
];
