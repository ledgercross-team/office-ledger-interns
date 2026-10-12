'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { errorMessage, formatMinutes, formatOffset } from '@/lib/format';
import type { AttendanceStats, TeamStats, TeamStatsRow, Tendency, Trend } from '@/lib/types';
import { AttendanceChart, type ChartMode } from './attendance-chart';
import { Scrolly } from './scrolly';
import { RateDonut } from './story';

export const TENDENCY_TEXT: Record<Tendency, { label: string; className: string }> = {
  no_data: { label: 'Not enough data', className: 'bg-charcoal/10 text-charcoal' },
  early_bird: { label: 'Early bird', className: 'bg-mist text-forest' },
  on_time: { label: 'On time', className: 'bg-mist text-forest' },
  cutting_it_close: { label: 'Cutting it close', className: 'bg-amber-tint text-amber-deep' },
  often_late: { label: 'Often late', className: 'bg-alert-tint text-alert-deep' },
};

const TREND_TEXT: Record<Trend, string> = {
  unknown: 'Not enough days to see a trend yet.',
  improving: 'Arrival times are getting earlier.',
  steady: 'Arrival times are steady.',
  slipping: 'Arrival times are drifting later.',
};

export function TendencyBadge({ tendency }: { tendency: Tendency }) {
  const { label, className } = TENDENCY_TEXT[tendency];
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

export function useAttendanceStats(path: string, days = 30) {
  return useQuery({
    queryKey: ['attendance', 'stats', path, days],
    queryFn: () => apiFetch<AttendanceStats>(`${path}?days=${days}`),
  });
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-charcoal-soft">{label}</p>
      <p className="text-lg font-semibold text-charcoal">{value}</p>
    </div>
  );
}

// Four scroll steps over one chart: arrivals, departures, hours, then the overall pattern.
export function AttendanceStory({ stats, name }: { stats: AttendanceStats; name?: string }) {
  const who = name ?? 'You';
  const verb = name ? 'arrives' : 'arrive';
  const MODES: ChartMode[] = ['in', 'out', 'hours'];

  const steps = [
    {
      kicker: 'Step 1 · Arriving',
      title: `${who} usually ${verb} ${formatOffset(stats.avgArrivalOffset)}`,
      body: (
        <>
          Average check-in is <strong>{formatMinutes(stats.avgCheckInMinutes)}</strong>. Amber dots
          are late days (more than 15 minutes after the start). {TREND_TEXT[stats.trend]}
        </>
      ),
    },
    {
      kicker: 'Step 2 · Leaving',
      title: `Average check-out ${formatMinutes(stats.avgCheckOutMinutes)}`,
      body: (
        <>
          {stats.missedCheckOuts === 0
            ? 'Every past day has a check-out.'
            : `${stats.missedCheckOuts} past ${stats.missedCheckOuts === 1 ? 'day has' : 'days have'} no check-out.`}{' '}
          Forgotten check-outs make hours look shorter than they were.
        </>
      ),
    },
    {
      kicker: 'Step 3 · Hours',
      title: `${stats.avgHoursWorked ?? '—'} hours on an average day`,
      body: <>The dashed line marks an eight hour day. Each bar is one day with a check-in and check-out.</>,
    },
    {
      kicker: 'Step 4 · The pattern',
      title: TENDENCY_TEXT[stats.tendency].label,
      body: (
        <>
          Score <strong>{stats.score ?? '—'}</strong> out of 100: half attendance, a third punctuality,
          the rest remembering to check out.
        </>
      ),
    },
  ];

  return (
    <Scrolly
      steps={steps}
      panel={(active) =>
        active <= 2 ? (
          <div>
            <AttendanceChart
              days={stats.series}
              mode={MODES[active]}
              workStartMinutes={stats.workStartMinutes}
              average={active === 0 ? stats.avgCheckInMinutes : stats.avgCheckOutMinutes}
            />
            <p className="mt-1 text-xs text-charcoal-soft">
              Last {stats.days} days · times in {stats.timezone} · × marks an absence
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <RateDonut rate={stats.score ?? 0} label="reliability score for this window." />
            <div className="grid grid-cols-3 gap-3">
              <Figure label="On time" value={`${stats.daysOnTime}`} />
              <Figure label="Late" value={`${stats.daysLate}`} />
              <Figure label="Absent" value={`${stats.daysAbsent}`} />
              <Figure label="Attendance" value={stats.attendanceRate === null ? '—' : `${stats.attendanceRate}%`} />
              <Figure label="Punctuality" value={stats.punctualityRate === null ? '—' : `${stats.punctualityRate}%`} />
              <Figure label="Avg hours" value={stats.avgHoursWorked === null ? '—' : `${stats.avgHoursWorked}`} />
            </div>
          </div>
        )
      }
    />
  );
}

// Loads and renders one person's story. `path` is the stats endpoint.
export function PersonInsights({ path, name, days = 30 }: { path: string; name?: string; days?: number }) {
  const query = useAttendanceStats(path, days);

  if (query.isLoading) return <p className="text-sm text-charcoal-soft">Loading insights…</p>;
  if (query.error || !query.data) {
    return (
      <p role="alert" className="text-sm text-alert-deep">
        {errorMessage(query.error)}
      </p>
    );
  }
  if (query.data.expectedDays === 0 && query.data.series.length === 0) {
    return <p className="text-sm text-charcoal-soft">Insights appear after the first working day.</p>;
  }
  return <AttendanceStory stats={query.data} name={name} />;
}

// -- Team --------------------------------------------------------------------------------

const STRIP_RANGE = 30; // minutes either side of the start time

// A dot on a line from "30 min early" to "30 min late", centred on the work start time.
function ArrivalStrip({ offset }: { offset: number | null }) {
  const reduce = useReducedMotion();
  if (offset === null) return <span className="text-xs text-charcoal-soft">no check-ins</span>;

  const clamped = Math.max(-STRIP_RANGE, Math.min(STRIP_RANGE, offset));
  const left = ((clamped + STRIP_RANGE) / (STRIP_RANGE * 2)) * 100;

  return (
    <div className="relative h-5 w-full min-w-28" title={formatOffset(offset)}>
      <div className="absolute top-1/2 h-0.5 w-full -translate-y-1/2 rounded bg-charcoal/10" />
      <div className="absolute top-0 h-full w-px bg-forest" style={{ left: '50%' }} />
      <motion.span
        className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${
          offset > 15 ? 'bg-alert' : offset > 5 ? 'bg-brand-amber' : 'bg-evergreen'
        }`}
        initial={{ left: '50%' }}
        whileInView={{ left: `${left}%` }}
        viewport={{ once: true, margin: '-48px' }}
        transition={{ duration: reduce ? 0 : 0.8, ease: 'easeOut' }}
      />
    </div>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  const reduce = useReducedMotion();
  const value = score ?? 0;

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-charcoal/10">
        <motion.div
          className={`h-full rounded-full ${value >= 80 ? 'bg-evergreen' : value >= 60 ? 'bg-brand-amber' : 'bg-alert'}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${value}%` }}
          viewport={{ once: true, margin: '-48px' }}
          transition={{ duration: reduce ? 0 : 0.8, ease: 'easeOut' }}
        />
      </div>
      <span className="w-8 text-right text-sm font-medium text-charcoal">
        {score === null ? '—' : score}
      </span>
    </div>
  );
}

export function TeamInsights({
  data,
  personHref = (row: TeamStatsRow) => `/people/${row.userId}`,
}: {
  data: TeamStats;
  personHref?: (row: TeamStatsRow) => string | null;
}) {
  const { summary } = data;
  const byArrival = [...data.people].sort(
    (a, b) => (a.avgArrivalOffset ?? 999) - (b.avgArrivalOffset ?? 999),
  );

  const steps = [
    {
      kicker: 'Step 1 · Arrivals',
      title: 'Who is early, who is late?',
      body: (
        <>
          Each dot is a person&apos;s average arrival against the {formatMinutes(data.workStartMinutes)}{' '}
          start. The team averages <strong>{formatOffset(summary.avgArrivalOffset)}</strong>.
        </>
      ),
    },
    {
      kicker: 'Step 2 · Reliability',
      title: 'Who can you count on?',
      body: (
        <>
          Score combines attendance, punctuality and check-outs. The team averages{' '}
          <strong>{summary.avgScore ?? '—'}</strong>, with {summary.onTimeRate ?? '—'}% of days on time.
        </>
      ),
    },
  ];

  return (
    <Scrolly
      steps={steps}
      panel={(active) => (
        <ul className="divide-y divide-charcoal/5">
          {(active === 0 ? byArrival : data.people).map((row) => {
            const href = personHref(row);
            const name = href ? (
              <Link href={href} className="font-medium text-evergreen hover:underline">
                {row.fullName}
              </Link>
            ) : (
              <span className="font-medium text-charcoal">{row.fullName}</span>
            );

            return (
              <li key={row.userId} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{name}</p>
                  <p className="text-xs text-charcoal-soft">
                    {active === 0
                      ? `in ${formatMinutes(row.avgCheckInMinutes)} · out ${formatMinutes(row.avgCheckOutMinutes)}`
                      : `${row.daysOnTime} on time · ${row.daysLate} late · ${row.daysAbsent} absent`}
                  </p>
                </div>
                {active === 0 ? <ArrivalStrip offset={row.avgArrivalOffset} /> : <ScoreBar score={row.score} />}
              </li>
            );
          })}
          {data.people.length === 0 && (
            <li className="py-3 text-sm text-charcoal-soft">No people to show yet.</li>
          )}
        </ul>
      )}
    />
  );
}

export function useTeamStats(days = 30, enabled = true) {
  return useQuery({
    queryKey: ['attendance', 'stats', 'team', days],
    queryFn: () => apiFetch<TeamStats>(`/attendance/stats/team?days=${days}`),
    enabled,
  });
}
