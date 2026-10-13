'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { motion } from 'motion/react';
import { MonthlyTeamInsights, PersonInsights } from '@/components/attendance-insights';
import { CheckInCard } from '@/components/check-in-card';
import { OpenTaskList } from '@/components/open-task-list';
import { OverdueList } from '@/components/overdue-list';
import { Reveal } from '@/components/reveal';
import { RoleGate } from '@/components/role-gate';
import { StatTile } from '@/components/stat-tile';
import {
  AttendanceBars,
  AttendanceSpotlight,
  RateDonut,
  ScrollProgress,
  StoryChapter,
} from '@/components/story';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { buildQuery, errorMessage, formatDate, todayIn } from '@/lib/format';
import type {
  AttendanceCounts,
  DashboardSummary,
  TasksByStatus,
  TeamAttendanceRow,
} from '@/lib/types';

const STATUS_LABELS: [keyof TasksByStatus, string][] = [
  ['todo', 'To do'],
  ['in_progress', 'In progress'],
  ['delayed', 'Delayed'],
  ['done', 'Done'],
  ['incomplete', 'Incomplete'],
  ['cancelled', 'Cancelled'],
];

const STATUS_BAR_CLASS: Record<keyof TasksByStatus, string> = {
  todo: 'bg-charcoal/40',
  in_progress: 'bg-mint',
  delayed: 'bg-brand-amber',
  done: 'bg-evergreen',
  incomplete: 'bg-alert',
  cancelled: 'bg-charcoal/20',
};

function TaskBars({ counts }: { counts: TasksByStatus }) {
  const taskTotal = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const total = Math.max(
    1,
    taskTotal,
  );
  const completedPercentage = taskTotal === 0 ? 0 : Math.round((counts.done / taskTotal) * 100);

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-charcoal">Work progress</p>
          <p className="text-xs text-charcoal-soft">
            {counts.done} of {taskTotal} {taskTotal === 1 ? 'task' : 'tasks'} completed
          </p>
        </div>
        <p className="text-xl font-semibold text-charcoal">{completedPercentage}%</p>
      </div>
      <ul className="space-y-3">
        {STATUS_LABELS.map(([key, label]) => {
          const pct = Math.round((counts[key] / total) * 100);
          return (
            <li key={key}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-medium text-charcoal">{label}</span>
                <span className="text-charcoal-soft">
                  {counts[key]} · {pct}%
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-charcoal/10">
                <motion.div
                  className={`h-full rounded-full ${STATUS_BAR_CLASS[key]}`}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${pct}%` }}
                  viewport={{ once: true, margin: '-48px' }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AttendanceStory({
  attendance,
  rate,
  spotlight,
  teamHref,
}: {
  attendance: AttendanceCounts;
  rate?: number;
  spotlight: { userId: string; userFullName: string; status: 'late' | 'absent' }[];
  teamHref?: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-5">
        {rate !== undefined && (
          <RateDonut rate={rate} label="of the company checked in on time or late today." />
        )}
        <AttendanceBars attendance={attendance} />
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold tracking-wide text-charcoal-soft uppercase">
          Needs attention
        </h3>
        <AttendanceSpotlight rows={spotlight} />
        {teamHref && (
          <p className="mt-3 text-sm">
            <Link href={teamHref} className="font-medium text-evergreen hover:underline">
              Open team attendance
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

// Late/absent names for the story, from the same endpoint the team page uses.
function useTodaySpotlight(enabled: boolean, timezone: string) {
  // The company's "today", which can differ from the browser's.
  const date = todayIn(timezone);
  const query = useQuery({
    queryKey: ['attendance', 'team', date],
    queryFn: () =>
      apiFetch<{ timezone: string; items: TeamAttendanceRow[] }>(`/attendance${buildQuery({ date })}`),
    enabled,
  });

  const spotlight = (query.data?.items ?? [])
    .filter((row) => row.status === 'late' || row.status === 'absent')
    .slice(0, 5)
    .map((row) => ({
      userId: row.userId,
      userFullName: row.userFullName,
      status: row.status as 'late' | 'absent',
    }));

  return spotlight;
}

function EmployeeDashboard({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="Open" value={summary.openTasks} />
          <StatTile label="Overdue" value={summary.overdueTasks} tone="warning" />
          <StatTile label="Done this week" value={summary.doneThisWeek} />
        </div>
      </Reveal>
      {summary.today && <CheckInCard today={summary.today} timezone={summary.timezone} />}
      <Reveal>
        <div className="rounded-2xl border border-charcoal/10 bg-white p-5 shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
          <OpenTaskList title="Open tasks" />
        </div>
      </Reveal>
      <StoryChapter
        step="Your attendance"
        title="How do your days look?"
        lede="Scroll through your last 30 days of check-ins and check-outs."
      >
        <PersonInsights path="/attendance/stats/me" />
      </StoryChapter>
    </div>
  );
}

function ManagerDashboard({ summary, userId }: { summary: DashboardSummary; userId: string }) {
  const team = summary.team;
  const spotlight = useTodaySpotlight(team !== undefined, summary.timezone);
  const ownStatus = summary.today?.status;
  const managerAttendance = team
    ? {
        total: team.attendance.total + 1,
        present: team.attendance.present + (ownStatus === 'present' ? 1 : 0),
        late: team.attendance.late + (ownStatus === 'late' ? 1 : 0),
        absent: team.attendance.absent + (ownStatus === 'absent' ? 1 : 0),
      }
    : undefined;
  const managerSpotlight = [
    ...(ownStatus === 'late' || ownStatus === 'absent'
      ? [{ userId, userFullName: 'You', status: ownStatus }]
      : []),
    ...spotlight,
  ].slice(0, 5);

  return (
    <div className="space-y-8">
      {summary.today && <CheckInCard today={summary.today} timezone={summary.timezone} />}

      <Reveal>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="My open" value={summary.openTasks} />
          <StatTile label="Overdue" value={summary.overdueTasks} tone="warning" />
          <StatTile label="Done this week" value={summary.doneThisWeek} />
        </div>
      </Reveal>

      {team && (
        <>
          <StoryChapter step="Chapter 1" title="How is the team doing today?" lede="Attendance for you and the people you manage.">
            <AttendanceStory
              attendance={managerAttendance ?? team.attendance}
              spotlight={managerSpotlight}
              teamHref="/team-attendance"
            />
          </StoryChapter>

          <StoryChapter
            step="Chapter 2"
            title="Who can you count on?"
            lede="On-time, late and absent attendance for the selected month."
          >
            <MonthlyTeamInsights key={todayIn(summary.timezone).slice(0, 7)} timezone={summary.timezone} />
          </StoryChapter>

          <StoryChapter step="Chapter 3" title="Where is the work stuck?" lede="Your tasks and your team’s tasks by status, then the overdue list.">
            <div className="grid gap-6 lg:grid-cols-2">
              <TaskBars counts={team.tasksByStatus} />
              <OverdueList items={team.overdueList} />
            </div>
          </StoryChapter>
        </>
      )}

      <Reveal>
        <div className="rounded-2xl border border-charcoal/10 bg-white p-5 shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
          <OpenTaskList title="My open tasks" assigneeId={userId} />
        </div>
      </Reveal>
    </div>
  );
}

function AdminDashboard({ summary }: { summary: DashboardSummary }) {
  const people = summary.peopleByRole;
  const spotlight = useTodaySpotlight(summary.attendance !== undefined, summary.timezone);

  return (
    <div className="space-y-8">
      <Reveal>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-5">
          <StatTile label="Active people" value={summary.activePeople ?? 0} />
          <StatTile label="Attendance rate" value={`${summary.todayAttendanceRate ?? 0}%`} />
          <StatTile label="Open tasks" value={summary.openTasks} />
          <StatTile label="Overdue" value={summary.overdueTasks} tone="warning" />
          <StatTile label="Task approvals" value={summary.pendingAssignmentApprovals ?? 0} tone="warning" />
        </div>
      </Reveal>

      {summary.attendance && (
        <StoryChapter
          step="Chapter 1"
          title="Who showed up today?"
          lede={`${summary.activePeople ?? 0} active people · ${(people?.manager ?? 0) + (people?.employee ?? 0)} managers and employees.`}
        >
          <AttendanceStory
            attendance={summary.attendance}
            rate={summary.todayAttendanceRate ?? 0}
            spotlight={spotlight}
            teamHref="/team-attendance"
          />
        </StoryChapter>
      )}

      <StoryChapter step="Chapter 2" title="Where is the work stuck?" lede="Company tasks by status, then the overdue list.">
        <div className="grid gap-6 lg:grid-cols-2">
          {summary.tasksByStatus && <TaskBars counts={summary.tasksByStatus} />}
          <OverdueList items={summary.overdueList ?? []} />
        </div>
      </StoryChapter>

      <StoryChapter
        step="Chapter 3"
        title="Who can you count on?"
        lede="On-time, late and absent attendance for the selected month."
      >
        <MonthlyTeamInsights key={todayIn(summary.timezone).slice(0, 7)} timezone={summary.timezone} />
      </StoryChapter>

      <StoryChapter step="Chapter 4" title="Is the account healthy?" lede="Subscription and unread messages.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="Subscription ends"
            value={summary.subscriptionEndsOn ? formatDate(summary.subscriptionEndsOn) : '—'}
          />
          <StatTile label="Days left" value={summary.daysLeft ?? '—'} />
          <StatTile label="Unread messages" value={summary.unreadMessages ?? 0} />
        </div>
        <p className="mt-4 text-sm">
          <Link href="/subscription" className="font-medium text-evergreen hover:underline">
            View subscription
          </Link>{' '}
          <span className="text-charcoal-soft">·</span>{' '}
          <Link href="/messages" className="font-medium text-evergreen hover:underline">
            Messages
          </Link>
          <span className="text-charcoal-soft">·</span>{' '}
          <Link href="/tasks" className="font-medium text-evergreen hover:underline">
            Review task approvals
          </Link>
        </p>
      </StoryChapter>
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => apiFetch<DashboardSummary>('/dashboard/summary'),
    refetchInterval: 60_000,
  });

  if (query.isLoading) {
    return <p className="text-sm text-charcoal-soft">Loading…</p>;
  }
  if (query.error || !query.data || !user) {
    return (
      <p role="alert" className="text-sm text-alert-deep">
        {errorMessage(query.error)}
      </p>
    );
  }

  const summary = query.data;
  const story = summary.role === 'admin' || summary.role === 'manager';

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold text-charcoal">Dashboard</h1>
      {story && <ScrollProgress />}
      {summary.role === 'admin' && <AdminDashboard summary={summary} />}
      {summary.role === 'manager' && <ManagerDashboard summary={summary} userId={user.id} />}
      {summary.role === 'employee' && <EmployeeDashboard summary={summary} />}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user?.role === 'game_master') router.replace('/game-master/dashboard');
  }, [user, router]);

  return (
    <RoleGate allow={['admin', 'manager', 'employee']}>
      <Dashboard />
    </RoleGate>
  );
}
