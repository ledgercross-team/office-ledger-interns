'use client';

import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BreakdownDrawer, ScoreBadge } from '@/components/hrms/performance-parts';
import { RoleGate } from '@/components/hrms/role-gate';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PageShell,
  Skeleton,
  StatTile,
} from '@/components/ui';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { hrmsFetch } from '@/lib/hrms/api-client';
import type { PerformanceRow } from '@/lib/hrms/types';

const DEFAULT_SCORE_WEIGHTS = [
  { label: 'Tasks done on time', weight: 50 },
  { label: 'Leave requests', weight: 10 },
  { label: 'Ratings', weight: 10 },
  { label: 'Attendance', weight: 30 },
] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function PerformanceLoading() {
  return (
    <div className="space-y-4" aria-label="Loading performance">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-28" />
      <div className="space-y-2">
        {[1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-20" />
        ))}
      </div>
    </div>
  );
}

function ScoreRow({ row, onOpen }: { row: PerformanceRow; onOpen: () => void }) {
  const change = row.changeVsPrev30d;
  const trendLabel =
    change === null
      ? null
      : `${change > 0 ? '+' : ''}${Math.round(change)} points vs previous window`;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group flex min-h-20 w-full flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-surface px-4 py-3 text-left transition-[border-color,background-color,box-shadow] hover:border-primary/40 hover:bg-surface-raised hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
        aria-label={`Open performance breakdown for ${row.fullName}`}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-fg group-hover:text-primary">{row.fullName}</span>
            <Badge tone="neutral">{row.role}</Badge>
          </span>
          <span className="mt-1 block text-xs text-fg-muted">
            Calculated {formatDate(row.computedOn)}
            {trendLabel && (
              <span className={change && change < 0 ? 'text-warning-fg' : 'text-success-fg'}>
                {' '}
                · {trendLabel}
              </span>
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <ScoreBadge row={row} />
          {row.trend === 'up' && (
            <TrendingUp aria-label="Trending up" className="size-4 text-success-fg" />
          )}
          {row.trend === 'down' && (
            <TrendingDown aria-label="Trending down" className="size-4 text-warning-fg" />
          )}
        </span>
      </button>
    </li>
  );
}

function Performance() {
  const { session } = useHrmsAuth();
  const [open, setOpen] = useState<string | null>(null);
  const data = useQuery({
    queryKey: ['hrms', 'performance'],
    queryFn: () => hrmsFetch<{ items: PerformanceRow[] }>('/performance'),
  });
  const org = useQuery({
    queryKey: ['hrms', 'org', 'performance-settings'],
    queryFn: () =>
      hrmsFetch<{
        settings: {
          weightAttendance: number;
          weightRating: number;
          weightOntime: number;
          weightLeave: number;
        };
      }>('/org'),
  });
  const rows = data.data?.items ?? [];
  const scoreWeights = org.data
    ? [
        { label: 'Tasks done on time', weight: org.data.settings.weightOntime },
        { label: 'Leave requests', weight: org.data.settings.weightLeave },
        { label: 'Ratings', weight: org.data.settings.weightRating },
        { label: 'Attendance', weight: org.data.settings.weightAttendance },
      ]
    : DEFAULT_SCORE_WEIGHTS;
  const scoreWeightTotal = scoreWeights.reduce((total, item) => total + item.weight, 0);
  const isSelfView = session?.role === 'manager' || session?.role === 'employee';
  const scoredRows = rows.filter((row) => row.score !== null);
  const average = scoredRows.length
    ? Math.round(scoredRows.reduce((total, row) => total + (row.score ?? 0), 0) / scoredRows.length)
    : null;

  return (
    <PageShell>
      <PageHeader
        title={isSelfView ? 'My performance' : 'Performance'}
        description={
          isSelfView
            ? 'Review your latest score and the factors that shape it. Scores are computed nightly.'
            : 'Review the team scorecard and inspect how attendance, ratings, tasks, and leave contribute.'
        }
      />

      {data.isError && (
        <ErrorState
          title="Could not load performance"
          message={(data.error as Error).message}
          onRetry={() => void data.refetch()}
        />
      )}

      {data.isLoading && <PerformanceLoading />}

      {!data.isLoading && !data.isError && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {scoreWeights.map((item) => (
              <StatTile
                key={item.label}
                label={item.label}
                value={`${item.weight}%`}
                delta="of total score"
                icon={<BarChart3 aria-hidden className="size-4" />}
              />
            ))}
          </div>

          <Card className="bg-surface-raised">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-fg">Performance matrix</h2>
                <p className="mt-1 text-sm text-fg-muted">
                  The total score is 100%, split across task completion, leave requests, ratings,
                  and attendance.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <div className="rounded-control bg-success-soft px-4 py-3 text-right">
                  <p className="text-xs text-success-fg">Total weight</p>
                  <p className="text-2xl font-semibold tabular-nums text-success-fg">
                    {scoreWeightTotal}%
                  </p>
                </div>
                {average !== null && !isSelfView && (
                  <div className="rounded-control bg-primary-soft px-4 py-3 text-right">
                    <p className="text-xs text-primary">Team average</p>
                    <p className="text-2xl font-semibold tabular-nums text-primary">{average}%</p>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {scoreWeights.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-3 border-t border-border pt-3 sm:block sm:border-t-0 sm:pt-0"
                >
                  <p className="text-sm text-fg-muted">{item.label}</p>
                  <p className="font-semibold tabular-nums text-fg">{item.weight}% of total</p>
                </div>
              ))}
            </div>
          </Card>

          {rows.length === 0 ? (
            <EmptyState
              icon={<BarChart3 aria-hidden className="size-5" />}
              title="No scores yet"
              description="Scores are computed nightly after enough attendance, task, leave, and rating data is available."
            />
          ) : (
            <section aria-labelledby="score-list-title" className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 id="score-list-title" className="text-lg font-semibold text-fg">
                    {isSelfView ? 'Your score' : 'People'}
                  </h2>
                  <p className="mt-1 text-sm text-fg-muted">
                    Select a row to inspect the calculation details and recent history.
                  </p>
                </div>
                {!isSelfView && (
                  <span className="text-sm tabular-nums text-fg-muted">{rows.length} people</span>
                )}
              </div>
              <ul className="space-y-2">
                {rows.map((row) => (
                  <ScoreRow key={row.memberId} row={row} onOpen={() => setOpen(row.memberId)} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {open && <BreakdownDrawer memberId={open} onClose={() => setOpen(null)} />}
    </PageShell>
  );
}

export default function PerformancePage() {
  return (
    <RoleGate allow={['ceo', 'coo', 'manager', 'employee']}>
      <Performance />
    </RoleGate>
  );
}
