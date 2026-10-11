'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CheckInCard } from '@/components/check-in-card';
import { OpenTaskList } from '@/components/open-task-list';
import { OverdueList } from '@/components/overdue-list';
import { RoleGate } from '@/components/role-gate';
import { StatTile } from '@/components/stat-tile';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, formatDate } from '@/lib/format';
import type { AttendanceCounts, DashboardSummary, TasksByStatus } from '@/lib/types';

const STATUS_LABELS: [keyof TasksByStatus, string][] = [
  ['todo', 'To do'],
  ['in_progress', 'In progress'],
  ['delayed', 'Delayed'],
  ['done', 'Done'],
  ['incomplete', 'Incomplete'],
  ['cancelled', 'Cancelled'],
];

function StatusTiles({ counts }: { counts: TasksByStatus }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {STATUS_LABELS.map(([key, label]) => (
        <StatTile key={key} label={label} value={counts[key]} />
      ))}
    </div>
  );
}

function AttendanceTiles({ attendance }: { attendance: AttendanceCounts }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="People" value={attendance.total} />
      <StatTile label="Present" value={attendance.present} />
      <StatTile label="Late" value={attendance.late} />
      <StatTile label="Absent" value={attendance.absent} />
    </div>
  );
}

function CountTiles({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatTile label="Open" value={summary.openTasks} />
      <StatTile label="Overdue" value={summary.overdueTasks} tone="warning" />
      <StatTile label="Done this week" value={summary.doneThisWeek} />
    </div>
  );
}

function EmployeeDashboard({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="space-y-6">
      <CountTiles summary={summary} />
      {summary.today && <CheckInCard today={summary.today} timezone={summary.timezone} />}
      <OpenTaskList title="Open tasks" />
    </div>
  );
}

function ManagerDashboard({ summary, userId }: { summary: DashboardSummary; userId: string }) {
  const team = summary.team;

  return (
    <div className="space-y-6">
      {summary.today && <CheckInCard today={summary.today} timezone={summary.timezone} />}
      <section className="space-y-3">
        <h2 className="font-semibold">My tasks</h2>
        <CountTiles summary={summary} />
      </section>
      <OpenTaskList title="My open tasks" assigneeId={userId} />

      {team && (
        <section aria-label="Team" className="space-y-4">
          <h2 className="text-lg font-semibold">Team</h2>
          <StatusTiles counts={team.tasksByStatus} />
          <OverdueList items={team.overdueList} />
          <div className="space-y-2">
            <h3 className="font-semibold">Attendance today</h3>
            <AttendanceTiles attendance={team.attendance} />
          </div>
        </section>
      )}
    </div>
  );
}

function AdminDashboard({ summary }: { summary: DashboardSummary }) {
  const people = summary.peopleByRole;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-semibold">People</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Managers" value={people?.manager ?? 0} />
          <StatTile label="Employees" value={people?.employee ?? 0} />
          <StatTile label="Active people" value={summary.activePeople ?? 0} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Tasks</h2>
        <CountTiles summary={summary} />
        {summary.tasksByStatus && <StatusTiles counts={summary.tasksByStatus} />}
      </section>

      <OverdueList items={summary.overdueList ?? []} />

      <section className="space-y-3">
        <h2 className="font-semibold">Attendance today</h2>
        <StatTile label="Attendance rate" value={`${summary.todayAttendanceRate ?? 0}%`} />
        {summary.attendance && <AttendanceTiles attendance={summary.attendance} />}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Subscription and messages</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="Subscription ends"
            value={summary.subscriptionEndsOn ? formatDate(summary.subscriptionEndsOn) : '—'}
          />
          <StatTile label="Days left" value={summary.daysLeft ?? '—'} />
          <StatTile label="Unread messages" value={summary.unreadMessages ?? 0} />
        </div>
        <p className="text-sm">
          <Link href="/subscription" className="underline">
            View subscription
          </Link>{' '}
          ·{' '}
          <Link href="/messages" className="underline">
            Messages
          </Link>
        </p>
      </section>
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => apiFetch<DashboardSummary>('/dashboard/summary'),
  });

  if (query.isLoading) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }
  if (query.error || !query.data || !user) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {errorMessage(query.error)}
      </p>
    );
  }

  const summary = query.data;

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
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
    if (user?.role === 'game_master') router.replace('/game-master');
  }, [user, router]);

  return (
    <RoleGate allow={['admin', 'manager', 'employee']}>
      <Dashboard />
    </RoleGate>
  );
}
