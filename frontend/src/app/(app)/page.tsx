'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Clock, ListChecks, LogIn, LogOut, TimerOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { HoldButton } from '@/components/hrms/hold-button';
import { TaskRow } from '@/components/hrms/project-card';
import { useReadOnly } from '@/components/hrms/read-only';
import { SeatBar } from '@/components/hrms/seat-bar';
import { usePunch } from '@/components/hrms/use-punch';
import { useNavCounts } from '@/components/hrms/use-nav-counts';
import { Button, Card, ErrorState, StatusPill } from '@/components/ui';
import { cn } from '@/lib/cn';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { ORG_STATUSES } from '@/lib/hrms/status-vocabulary';
import { formatTime } from '@/lib/hrms/time';
import {
  HRMS_ROLE_LABELS,
  type AttendanceDayEntry,
  type AttendanceDayStatus,
  type HrmsOrg,
  type HrmsTask,
  type Paginated,
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
    <div className="flex items-center gap-4 rounded-card border border-border bg-surface p-4">
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-fg"
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

  if (!session) return null;

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
  const waiting = [
    { label: 'Requests to decide', n: counts.requests, href: '/requests' },
    { label: 'Project invites', n: counts.invites, href: '/invites' },
    { label: 'Ratings due', n: counts.ratings, href: '/ratings' },
    { label: 'Unread messages', n: counts.messages, href: '/messages' },
  ].filter((w) => w.n > 0);

  const statusLabel = checkedOut
    ? `Checked out ${formatTime(today?.checkOutAt ?? null)}`
    : working
      ? `Checked in ${formatTime(today?.checkInAt ?? null)}`
      : 'Not checked in';

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-fg p-6 text-bg sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold sm:text-3xl">
              {greeting(now.getHours())}, {firstName}
            </h1>
            <p className="mt-1 text-sm text-bg/75">
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
                  : 'bg-bg/15 text-bg',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'size-2 rounded-full',
                working ? 'bg-success' : checkedOut ? 'bg-info' : 'bg-bg/60',
              )}
            />
            {statusLabel}
          </span>
        </div>
        <div className="mt-6">
          <div className="mb-1.5 flex justify-between text-xs text-bg/75">
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
            className="h-2.5 overflow-hidden rounded-full bg-bg/15"
          >
            <div
              className="h-full rounded-full bg-rail transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </section>

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
            <p
              role="alert"
              className="max-w-sm rounded-control bg-danger-soft px-3 py-2 text-sm text-danger-fg"
            >
              {error}
            </p>
          )}
          {me.error && !error && (
            <p role="alert" className="text-sm text-danger-fg">
              Could not load today&apos;s attendance.
            </p>
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
                <span className="hidden text-[11px] sm:block">
                  {d.status ? DAY_LABEL[d.status] : '—'}
                </span>
                <span className="text-[11px] tabular-nums">
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
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Clock aria-hidden className="size-5" />
            Your work
          </h2>
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
