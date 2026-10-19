'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarCheck,
  CalendarPlus,
  ClipboardList,
  Clock,
  ListChecks,
  LogIn,
  LogOut,
  MessageSquare,
  Plane,
  TimerOff,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { HoldButton } from '@/components/hrms/hold-button';
import { TaskRow } from '@/components/hrms/project-card';
import { useReadOnly } from '@/components/hrms/read-only';
import { SeatBar } from '@/components/hrms/seat-bar';
import { usePunch } from '@/components/hrms/use-punch';
import { useNavCounts } from '@/components/hrms/use-nav-counts';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusPill,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { canDecideRequests, isLeadershipRole, ROLE_UI } from '@/lib/hrms/role-ui';
import { ORG_STATUSES, PERFORMANCE_BANDS } from '@/lib/hrms/status-vocabulary';
import { formatTime } from '@/lib/hrms/time';
import {
  HRMS_ROLE_LABELS,
  type AttendanceDayEntry,
  type AttendanceDayStatus,
  type HrmsOrg,
  type HrmsTask,
  type LeaveBalance,
  type Paginated,
  type PerformanceRow,
} from '@/lib/hrms/types';

const TARGET_MINUTES = 8 * 60;

function greeting(hour: number): string {
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function useNow(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

const DAY_STYLE: Record<AttendanceDayStatus, string> = {
  present: 'bg-success-soft text-success-fg',
  late: 'bg-warning-soft text-warning-fg',
  absent: 'bg-danger-soft text-danger-fg',
  on_leave: 'bg-info-soft text-info-fg',
  holiday: 'bg-surface-sunken text-fg-muted',
  weekend: 'bg-surface-sunken text-fg-subtle',
};
const DAY_LABEL: Record<AttendanceDayStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  on_leave: 'Leave',
  holiday: 'Holiday',
  weekend: 'Off',
};

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-border bg-surface-raised p-4 shadow-[0_1px_2px_rgb(15_41_49_/_0.03)]">
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-control border border-border bg-primary-soft text-primary"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-fg-muted">{label}</p>
        <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
        {hint && <p className="truncate text-xs text-fg-subtle">{hint}</p>}
      </div>
    </div>
  );
}

function lastSevenDays(days: AttendanceDayEntry[] | undefined, todayDate: string | undefined) {
  if (!days || !todayDate) return [];
  return days.filter((d) => d.date <= todayDate).slice(-7);
}

function formatDays(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function HrmsHomePage() {
  const { session } = useHrmsAuth();
  const readOnly = useReadOnly();
  const now = useNow();
  const { me, today, checkedIn, checkedOut, error, punch } = usePunch();
  const counts = useNavCounts();
  const canSeeSeats = session?.role === 'ceo' || session?.role === 'coo';

  const org = useQuery({
    queryKey: ['hrms', 'org', session?.activeMemberId],
    queryFn: () => hrmsFetch<HrmsOrg>('/org'),
    enabled: Boolean(session?.org),
    retry: false,
  });
  const myTasks = useQuery({
    queryKey: ['hrms', 'tasks', session?.activeMemberId, 'dashboard-mine'],
    queryFn: () => hrmsFetch<Paginated<HrmsTask>>('/tasks?mine=true&open=true&pageSize=5'),
    enabled: Boolean(session?.activeMemberId),
    retry: false,
  });
  const leave = useQuery({
    queryKey: ['hrms', 'leave', 'balance', session?.activeMemberId, 'dashboard'],
    queryFn: () => hrmsFetch<{ items: LeaveBalance[] }>('/leave/balance'),
    enabled: Boolean(session?.activeMemberId),
    retry: false,
  });
  const performance = useQuery({
    queryKey: ['hrms', 'performance', session?.activeMemberId, 'dashboard'],
    queryFn: () => hrmsFetch<{ items: PerformanceRow[] }>('/performance'),
    enabled: Boolean(session?.activeMemberId),
    retry: false,
  });

  if (!session || !session.role || session.role === 'gameMaster') return null;

  const roleUi = ROLE_UI[session.role];
  const isLeadership = isLeadershipRole(session.role);
  const canDecide = canDecideRequests(session.role);
  const firstName = session.user.fullName.split(' ')[0];
  const working = checkedIn && !checkedOut;
  const workedMinutes =
    today?.checkInAt != null
      ? Math.max(
          0,
          Math.round(
            ((today.checkOutAt ? new Date(today.checkOutAt) : now).getTime() -
              new Date(today.checkInAt).getTime()) /
              60_000,
          ),
        )
      : 0;
  const progress = Math.min(100, (workedMinutes / TARGET_MINUTES) * 100);
  const days = me.data?.days ?? [];
  const counted = days.filter(
    (d) => d.status === 'present' || d.status === 'late' || d.status === 'absent',
  );
  const presentDays = days.filter((d) => d.status === 'present' || d.status === 'late').length;
  const lateDays = days.filter((d) => d.status === 'late').length;
  const week = lastSevenDays(me.data?.days, me.data?.todayDate);
  const leaveItems = leave.data?.items ?? [];
  const leaveRemaining = leaveItems.reduce((total, item) => total + Math.max(0, item.remaining), 0);
  const leaveAllowance = leaveItems.reduce((total, item) => total + item.allowance, 0);
  const myPerformance = performance.data?.items.find(
    (row) => row.memberId === session.activeMemberId,
  );
  const performanceRows = performance.data?.items ?? [];
  const scoredRows = performanceRows.filter((row) => row.score !== null);
  const teamAverage = scoredRows.length
    ? Math.round(scoredRows.reduce((total, row) => total + (row.score ?? 0), 0) / scoredRows.length)
    : null;
  const quickActions =
    session.role === 'ceo'
      ? [
          {
            label: 'Review approvals',
            href: '/requests',
            icon: <Clock aria-hidden className="size-4" />,
          },
          {
            label: 'Manage people',
            href: '/people',
            icon: <UserPlus aria-hidden className="size-4" />,
          },
          {
            label: 'New project',
            href: '/projects/new',
            icon: <CalendarPlus aria-hidden className="size-4" />,
          },
          {
            label: 'Team performance',
            href: '/performance',
            icon: <BarChart3 aria-hidden className="size-4" />,
          },
        ]
      : session.role === 'coo'
        ? [
            {
              label: 'Review approvals',
              href: '/requests',
              icon: <Clock aria-hidden className="size-4" />,
            },
            {
              label: 'Manage people',
              href: '/people',
              icon: <UserPlus aria-hidden className="size-4" />,
            },
            {
              label: 'Team attendance',
              href: '/attendance/team',
              icon: <CalendarCheck aria-hidden className="size-4" />,
            },
            {
              label: 'Team performance',
              href: '/performance',
              icon: <BarChart3 aria-hidden className="size-4" />,
            },
          ]
        : session.role === 'manager'
          ? [
              {
                label: 'Create task',
                href: '/tasks/new',
                icon: <ListChecks aria-hidden className="size-4" />,
              },
              {
                label: 'Review requests',
                href: '/requests',
                icon: <Clock aria-hidden className="size-4" />,
              },
              {
                label: 'Team attendance',
                href: '/attendance/team',
                icon: <CalendarCheck aria-hidden className="size-4" />,
              },
              {
                label: 'Team workload',
                href: '/workload',
                icon: <BarChart3 aria-hidden className="size-4" />,
              },
            ]
          : [
              {
                label: 'Open tasks',
                href: '/tasks',
                icon: <ClipboardList aria-hidden className="size-4" />,
              },
              {
                label: 'Request leave',
                href: '/leave',
                icon: <Plane aria-hidden className="size-4" />,
              },
              {
                label: 'My attendance',
                href: '/attendance',
                icon: <CalendarCheck aria-hidden className="size-4" />,
              },
              {
                label: 'Open messages',
                href: '/messages',
                icon: <MessageSquare aria-hidden className="size-4" />,
              },
            ];
  const waiting = [
    ...(canDecide ? [{ label: 'Requests to decide', n: counts.requests, href: '/requests' }] : []),
    {
      label: isLeadership || session.role === 'manager' ? 'Invites to review' : 'Invites to answer',
      n: counts.invites,
      href: '/invites',
    },
    ...(session.role === 'manager' || session.role === 'employee'
      ? [{ label: 'Ratings due', n: counts.ratings, href: '/ratings' }]
      : []),
    { label: 'Unread messages', n: counts.messages, href: '/messages' },
  ].filter((w) => w.n > 0);

  const statusLabel = checkedOut
    ? `Checked out ${formatTime(today?.checkOutAt ?? null)}`
    : working
      ? `Checked in ${formatTime(today?.checkInAt ?? null)}`
      : 'Not checked in';

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.2rem] border border-white/10 bg-rail p-6 text-rail-fg shadow-[0_18px_45px_rgb(15_41_49_/_0.16)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold sm:text-3xl">
              {greeting(now.getHours())}, {firstName}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-rail-fg/75">{roleUi.dashboardDescription}</p>
            <p className="mt-2 text-xs text-rail-fg/55">
              {now.toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              {session.org &&
                session.role &&
                ` · ${HRMS_ROLE_LABELS[session.role]} at ${session.org.name}`}
            </p>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold',
              working
                ? 'bg-success-soft text-success-fg'
                : checkedOut
                  ? 'bg-info-soft text-info-fg'
                  : 'bg-white/10 text-rail-fg',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'size-2 rounded-full',
                working ? 'bg-success' : checkedOut ? 'bg-info' : 'bg-rail-fg/60',
              )}
            />
            {statusLabel}
          </span>
        </div>
        <div className="mt-6">
          <div className="mb-1.5 flex justify-between text-xs text-rail-fg/75">
            <span>
              {checkedIn
                ? `${Math.floor(workedMinutes / 60)}h ${String(workedMinutes % 60).padStart(2, '0')}m worked`
                : 'Your day starts when you check in'}
            </span>
            <span>8h target</span>
          </div>
          <div
            role="progressbar"
            aria-label="Workday progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            className="h-2.5 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="dashboard-glance-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="dashboard-glance-heading" className="text-lg font-bold tracking-tight">
              Today at a glance
            </h2>
            <p className="text-sm text-fg-muted">
              The information you need before you get to work.
            </p>
          </div>
          <Link
            href="/calendar"
            className="hidden text-sm font-medium text-primary hover:underline sm:block"
          >
            Open calendar
          </Link>
        </div>
        <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <div>
              <h2 className="text-xl font-bold">
                {checkedOut
                  ? 'Day complete'
                  : working
                    ? 'You are on the clock'
                    : 'Start your workday'}
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                {checkedOut
                  ? `You worked ${Math.floor(workedMinutes / 60)}h ${String(workedMinutes % 60).padStart(2, '0')}m today. See you tomorrow.`
                  : working
                    ? 'Press and hold when you are done for the day.'
                    : 'Press and hold to record your attendance for today.'}
              </p>
            </div>
            {!checkedOut && (
              <HoldButton
                className="min-h-14 min-w-64 px-10 text-lg"
                disabled={readOnly.readOnly || me.isLoading}
                disabledReason={readOnly.reason ?? undefined}
                onHold={() => punch(working ? 'check-out' : 'check-in')}
              >
                {working ? (
                  <LogOut aria-hidden className="size-5" />
                ) : (
                  <LogIn aria-hidden className="size-5" />
                )}
                {working ? 'Hold to check out' : 'Hold to check in'}
              </HoldButton>
            )}
            {error && (
              <Banner tone="danger" title="Attendance action failed">
                {error}
              </Banner>
            )}
            {me.error && !error && (
              <ErrorState
                title="Could not load today's attendance"
                message="Your attendance summary is unavailable."
                onRetry={() => void me.refetch()}
              />
            )}
            <dl className="flex gap-8 text-sm tabular-nums">
              <div>
                <dt className="text-fg-muted">In</dt>
                <dd className="font-bold">{formatTime(today?.checkInAt ?? null)}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">Out</dt>
                <dd className="font-bold">{formatTime(today?.checkOutAt ?? null)}</dd>
              </div>
            </dl>
          </Card>

          <div className="grid gap-3">
            <Stat
              icon={<CalendarCheck className="size-5" />}
              label="Present days"
              value={me.data ? `${presentDays}/${counted.length}` : '–'}
              hint={me.data ? `of ${counted.length} working days so far` : undefined}
            />
            <Stat
              icon={<TimerOff className="size-5" />}
              label="Late arrivals"
              value={me.data ? String(lateDays).padStart(2, '0') : '–'}
              hint="This month"
            />
            <Stat
              icon={<ListChecks className="size-5" />}
              label="Open tasks"
              value={myTasks.data ? String(myTasks.data.total) : '–'}
              hint="Assigned to you"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Plane aria-hidden className="size-5 text-primary" />
                Leave balance
              </h2>
              <p className="mt-1 text-sm text-fg-muted">Your remaining allowance this year.</p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/leave">View leave</Link>
            </Button>
          </div>
          {leave.isLoading ? (
            <div className="space-y-3" aria-label="Loading leave balance">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : leave.error ? (
            <ErrorState
              title="Could not load leave balance"
              message="Your leave balance is unavailable right now."
              onRetry={() => void leave.refetch()}
            />
          ) : leaveItems.length === 0 ? (
            <EmptyState
              title="No leave types yet"
              description="Your organisation has not configured any active leave types."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold tabular-nums text-fg">
                  {formatDays(leaveRemaining)}
                </span>
                <span className="pb-1 text-sm text-fg-muted">
                  of {formatDays(leaveAllowance)} days remaining
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {leaveItems.slice(0, 4).map((item) => (
                  <div
                    key={item.leaveTypeId}
                    className="flex items-center justify-between gap-3 rounded-control bg-surface-sunken px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-fg-muted">{item.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-fg">
                      {formatDays(Math.max(0, item.remaining))}d
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <BarChart3 aria-hidden className="size-5 text-primary" />
                {isLeadership ? 'Team performance' : 'Your performance'}
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                {isLeadership ? 'Current organisation scorecard.' : 'Your latest calculated score.'}
              </p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/performance">View details</Link>
            </Button>
          </div>
          {performance.isLoading ? (
            <div className="space-y-3" aria-label="Loading performance">
              <Skeleton className="h-20 w-20 rounded-card" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : performance.error ? (
            <ErrorState
              title="Could not load performance"
              message={
                isLeadership
                  ? 'The team performance scorecard is unavailable right now.'
                  : 'Your performance score is unavailable right now.'
              }
              onRetry={() => void performance.refetch()}
            />
          ) : isLeadership ? (
            performanceRows.length === 0 ? (
              <EmptyState
                title="No team scores yet"
                description="Scores will appear after enough attendance, task, leave, and rating data is available."
              />
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex size-20 items-center justify-center rounded-card bg-primary-soft text-2xl font-bold tabular-nums text-primary">
                  {teamAverage === null ? '—' : teamAverage}
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-fg">Team average</p>
                  <p className="text-sm text-fg-muted">
                    {scoredRows.length} of {performanceRows.length} people have a calculated score.
                  </p>
                  <Link
                    href="/performance"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Inspect the scorecard
                  </Link>
                </div>
              </div>
            )
          ) : !myPerformance ? (
            <EmptyState
              title="No score yet"
              description="Your first score will appear after performance is calculated."
            />
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex size-20 items-center justify-center rounded-card bg-primary-soft text-2xl font-bold tabular-nums text-primary">
                {myPerformance.score === null ? '—' : Math.round(myPerformance.score)}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {myPerformance.band && (
                    <StatusPill status={PERFORMANCE_BANDS[myPerformance.band]} />
                  )}
                  {myPerformance.isNew && <span className="text-sm text-fg-muted">New score</span>}
                </div>
                <p className="text-sm text-fg-muted">
                  {myPerformance.score === null
                    ? 'Not enough data yet.'
                    : `Updated ${myPerformance.computedOn}`}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Quick actions</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Jump straight to the work you do most often.
            </p>
          </div>
          <CalendarPlus aria-hidden className="size-5 text-primary" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex min-h-11 items-center gap-3 rounded-control border border-border bg-surface-raised px-3 py-2 text-sm font-medium transition-[background-color,border-color,transform] duration-150 hover:-translate-y-px hover:border-primary/50 hover:bg-primary-soft/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-fg">
                {action.icon}
              </span>
              <span>{action.label}</span>
            </Link>
          ))}
        </div>
      </Card>

      {myTasks.error && (
        <ErrorState
          title="Could not load your tasks"
          message="Your attendance and other dashboard summaries are still available."
          onRetry={() => void myTasks.refetch()}
        />
      )}

      {week.length > 0 && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">My last seven days</h2>
              <p className="text-sm text-fg-muted">Your attendance at a glance.</p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/attendance">Full record</Link>
            </Button>
          </div>
          <ul className="grid grid-cols-7 gap-2">
            {week.map((d) => (
              <li
                key={d.date}
                className={cn(
                  'flex min-w-0 flex-col items-center gap-1 rounded-control px-1 py-3 text-center',
                  d.status ? DAY_STYLE[d.status] : 'bg-surface-sunken text-fg-subtle',
                )}
              >
                <span className="text-xs font-medium">
                  {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: 'short',
                  })}
                </span>
                <span className="text-lg font-bold tabular-nums leading-none">
                  {d.date.slice(8)}
                </span>
                <span className="hidden text-xs sm:block">
                  {d.status ? DAY_LABEL[d.status] : '—'}
                </span>
                <span className="text-xs tabular-nums">
                  {d.workedMinutes != null
                    ? `${Math.floor(d.workedMinutes / 60)}h${String(d.workedMinutes % 60).padStart(2, '0')}`
                    : ' '}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(waiting.length > 0 || (myTasks.data && myTasks.data.total > 0)) && (
        <Card className="space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Clock aria-hidden className="size-5" />
              {roleUi.workHeading}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{roleUi.workDescription}</p>
          </div>
          {waiting.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {waiting.map((w) => (
                <Link
                  key={w.href}
                  href={w.href}
                  className="rounded-full bg-primary-soft px-3 py-1.5 text-sm font-medium transition-[transform,background-color] duration-150 hover:-translate-y-px hover:bg-primary-soft/70 active:scale-95 motion-reduce:transform-none"
                >
                  <span className="font-bold tabular-nums">{w.n}</span> {w.label}
                </Link>
              ))}
            </div>
          )}
          {myTasks.data && myTasks.data.total > 0 && (
            <div>
              <ul className="-mx-3">
                {myTasks.data.items.map((t) => (
                  <TaskRow key={t.id} task={t} showProject />
                ))}
              </ul>
              {myTasks.data.total > myTasks.data.items.length && (
                <Link href="/tasks" className="mt-1 inline-block text-sm font-bold hover:underline">
                  See all {myTasks.data.total} tasks →
                </Link>
              )}
            </div>
          )}
        </Card>
      )}

      {org.error && (
        <ErrorState message="Could not load the organisation." onRetry={() => void org.refetch()} />
      )}
      {session.org && canSeeSeats && org.data?.seats && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{session.org.name}</h2>
            <StatusPill status={ORG_STATUSES[session.org.status]} />
          </div>
          <SeatBar seats={org.data.seats} />
        </Card>
      )}
    </div>
  );
}
