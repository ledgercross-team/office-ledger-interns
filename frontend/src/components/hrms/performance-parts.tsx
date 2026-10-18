'use client';

import { useQuery } from '@tanstack/react-query';
import { hrmsFetch } from '@/lib/hrms/api-client';
import type { PerformanceBand, PerformanceBreakdown, PerformanceRow } from '@/lib/hrms/types';

const BAND_CLASS: Record<PerformanceBand, string> = {
  excellent: 'bg-evergreen/10 text-forest',
  good: 'bg-sky-100 text-sky-900',
  needs_attention: 'bg-amber-100 text-amber-900',
  poor: 'bg-alert-deep/10 text-alert-deep',
};

const BAND_LABEL: Record<PerformanceBand, string> = {
  excellent: 'Excellent',
  good: 'Good',
  needs_attention: 'Needs attention',
  poor: 'Poor',
};

const ARROW = { up: '↑', down: '↓', flat: '→' } as const;

export function ScoreBadge({
  row,
}: {
  row: Pick<PerformanceRow, 'score' | 'band' | 'trend' | 'isNew'> | undefined;
}) {
  if (!row || row.score === null || row.band === null) {
    return <span className="text-xs text-charcoal-soft">{row?.isNew ? 'New' : '—'}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BAND_CLASS[row.band]}`}>
        {Math.round(row.score)}/100 · {BAND_LABEL[row.band]}
      </span>
      {row.trend && <span aria-label={`trend ${row.trend}`}>{ARROW[row.trend]}</span>}
      {row.isNew && <span className="text-xs text-charcoal-soft">New</span>}
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
    <div className="rounded-xl border border-charcoal/10 p-3">
      <p className="text-sm font-medium text-charcoal">
        {label}: {score === null ? 'not enough data' : `${Math.round(score)}/100`}
      </p>
      <p className="text-xs text-charcoal-soft">
        {detail}
        {weight !== null ? ` · weight ${weight}` : ''}
      </p>
    </div>
  );
}

/** Breakdown drawer. CEOs/COOs can inspect the org; managers/employees can inspect themselves. */
export function BreakdownDrawer({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const data = useQuery({
    queryKey: ['hrms', 'performance', memberId],
    queryFn: () => hrmsFetch<PerformanceBreakdown>(`/performance/${memberId}`),
  });
  const d = data.data;

  return (
    <aside
      role="dialog"
      aria-label="Performance breakdown"
      className="fixed inset-y-0 right-0 z-50 w-full max-w-sm space-y-3 overflow-y-auto border-l border-charcoal/10 bg-white p-4 shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-medium text-charcoal">{d?.fullName ?? 'Performance'}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-charcoal-soft hover:underline"
        >
          Close
        </button>
      </div>
      {data.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {data.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {(data.error as Error).message}
        </p>
      )}
      {d && (
        <>
          <ScoreBadge row={{ score: d.score, band: d.band, trend: null, isNew: d.isNew }} />
          <p className="text-xs text-charcoal-soft">
            Window {d.windowStart} to {d.computedOn}
          </p>
          <Part
            label="Attendance"
            score={d.attendance.score}
            detail={`${d.attendance.points ?? 0} points over ${d.attendance.workingDays ?? 0} working days`}
            weight={d.attendance.weight}
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
            label="Leave"
            score={d.leave.score}
            detail={`${d.leave.days ?? 0} unpaid or over-allowance day${d.leave.days === 1 ? '' : 's'}`}
            weight={d.leave.weight}
          />
          <Part
            label="Tasks on time"
            score={d.onTime.score}
            detail={`${d.onTime.done} of ${d.onTime.total} on time`}
            weight={d.onTime.weight}
          />
          <div>
            <p className="text-sm font-medium text-charcoal">Recent</p>
            <ul className="text-sm text-charcoal-soft">
              {d.history.map((h) => (
                <li key={h.computedOn}>
                  {h.computedOn}: {h.score === null ? '—' : Math.round(h.score)}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </aside>
  );
}
