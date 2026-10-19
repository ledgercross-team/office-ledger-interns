'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Drawer,
  EmptyState,
  ErrorState,
  ProgressBar,
  Skeleton,
  StatusPill,
} from '@/components/ui';
import { PERFORMANCE_BANDS } from '@/lib/hrms/status-vocabulary';
import { hrmsFetch } from '@/lib/hrms/api-client';
import type { PerformanceBand, PerformanceBreakdown, PerformanceRow } from '@/lib/hrms/types';

const ARROW = { up: '↑', down: '↓', flat: '→' } as const;

export function ScoreBadge({
  row,
}: {
  row: Pick<PerformanceRow, 'score' | 'band' | 'trend'> | undefined;
}) {
  if (!row || row.score === null || row.band === null) {
    return <Badge tone="neutral">Not available</Badge>;
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <span className="text-sm font-semibold tabular-nums text-fg">{Math.round(row.score)}%</span>
      <StatusPill status={PERFORMANCE_BANDS[row.band]} />
      {row.trend && (
        <span className="text-sm text-fg-muted" aria-label={`trend ${row.trend}`}>
          {ARROW[row.trend]}
        </span>
      )}
    </span>
  );
}

function Part({
  label,
  score,
  detail,
  weight,
}: {
  label: string;
  score: number | null;
  detail: string;
  weight: number | null;
}) {
  return (
    <div className="space-y-3 rounded-control border border-border bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-fg">{label}</p>
        {weight !== null && <Badge tone="primary">{weight}% weight</Badge>}
      </div>
      {score === null ? (
        <p className="text-sm text-fg-muted">Not enough data to score this component yet.</p>
      ) : (
        <ProgressBar value={score} label={`${label} score`} />
      )}
      <p className="text-xs text-fg-muted">{detail}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

/** Breakdown drawer. CEOs/COOs can inspect the org; managers/employees can inspect themselves. */
export function BreakdownDrawer({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const data = useQuery({
    queryKey: ['hrms', 'performance', memberId],
    queryFn: () => hrmsFetch<PerformanceBreakdown>(`/performance/${memberId}`),
  });
  const d = data.data;
  const band = d?.band as PerformanceBand | null | undefined;
  const weightTotal = d
    ? [d.attendance.weight, d.leave.weight, d.ratings.weight, d.onTime.weight].reduce<number>(
        (total, weight) => total + (weight ?? 0),
        0,
      )
    : 0;

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={d?.fullName ?? 'Performance breakdown'}
      description="Review the score components and the current calculation window."
    >
      {data.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-28" />
          ))}
        </div>
      )}
      {data.error && (
        <ErrorState
          title="Could not load breakdown"
          message={(data.error as Error).message}
          onRetry={() => void data.refetch()}
        />
      )}
      {d && (
        <div className="space-y-4">
          <div className="rounded-card border border-primary/20 bg-primary-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  Overall score
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-fg">
                  {d.score === null ? '—' : `${Math.round(d.score)}%`}
                </p>
              </div>
              {band ? (
                <StatusPill status={PERFORMANCE_BANDS[band]} />
              ) : (
                <Badge tone="neutral">Not available</Badge>
              )}
            </div>
            <p className="mt-3 text-xs text-fg-muted">
              Calculation window: {formatDate(d.windowStart)} – {formatDate(d.computedOn)}
            </p>
          </div>

          <div className="rounded-control border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-fg">Performance matrix</p>
              <Badge tone="success">{weightTotal}% total</Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-fg-muted">
              Each component is scored from 0 to 100, then multiplied by its weight. The weights
              shown below come from organisation settings and total 100%.
            </p>
          </div>

          <div className="space-y-2">
            <Part
              label="Tasks done on time"
              score={d.onTime.score}
              detail={`${d.onTime.done} of ${d.onTime.total} on time`}
              weight={d.onTime.weight}
            />
            <Part
              label="Leave requests"
              score={d.leave.score}
              detail={`${d.leave.days ?? 0} unpaid or over-allowance day${d.leave.days === 1 ? '' : 's'}`}
              weight={d.leave.weight}
            />
            <Part
              label="Ratings"
              score={d.ratings.score}
              detail={
                d.ratings.summary
                  ? `${d.ratings.summary.average} average from ${d.ratings.summary.count} ratings`
                  : `${d.ratings.count} ratings, shown once there are enough`
              }
              weight={d.ratings.weight}
            />
            <Part
              label="Attendance"
              score={d.attendance.score}
              detail={`${d.attendance.points ?? 0} points over ${d.attendance.workingDays ?? 0} working days`}
              weight={d.attendance.weight}
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-fg">Recent history</p>
            {d.history.length === 0 ? (
              <EmptyState
                title="No previous snapshots"
                description="Earlier calculated scores will appear here."
              />
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-control border border-border bg-surface">
                {d.history.map((h) => (
                  <li
                    key={h.computedOn}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="text-fg-muted">{formatDate(h.computedOn)}</span>
                    <span className="font-medium tabular-nums text-fg">
                      {h.score === null ? '—' : `${Math.round(h.score)}%`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
