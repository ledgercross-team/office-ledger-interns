'use client';

import { motion, useScroll } from 'motion/react';
import type { ReactNode } from 'react';
import { AttendanceStatus } from '@/components/attendance-status';
import { Reveal } from '@/components/reveal';
import type { AttendanceCounts } from '@/lib/types';

// Thin scroll-linked progress bar. Sticky at the top of the story.
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();

  return (
    <div className="sticky top-0 z-10 bg-offwhite/90 py-2 backdrop-blur">
      <motion.div style={{ scaleX: scrollYProgress }} className="h-1 origin-left rounded-full bg-evergreen" />
    </div>
  );
}

// Numbered story chapter: generous spacing so each step owns the viewport.
export function StoryChapter({
  step,
  title,
  lede,
  children,
}: {
  step: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <Reveal>
      <section className="rounded-2xl border border-charcoal/10 bg-white p-5 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:p-8">
        <p className="text-xs font-semibold tracking-widest text-evergreen uppercase">{step}</p>
        <h2 className="mt-1 break-words text-xl font-semibold text-charcoal">{title}</h2>
        {lede && <p className="mt-1 break-words text-sm text-charcoal-soft">{lede}</p>}
        <div className="mt-5">{children}</div>
      </section>
    </Reveal>
  );
}

// Animated donut: share of `value` in `total`.
export function RateDonut({ rate, label }: { rate: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(rate)));
  const r = 52;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative h-28 w-28 shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" strokeWidth="12" className="stroke-mist" />
          <motion.circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            className="stroke-evergreen"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            whileInView={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
            viewport={{ once: true, margin: '-48px' }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        <p className="absolute inset-0 flex items-center justify-center text-xl font-semibold text-charcoal">
          {clamped}%
        </p>
      </div>
      <p className="min-w-0 flex-1 text-sm text-charcoal-soft">{label}</p>
    </div>
  );
}

const BAR_STYLES = [
  { key: 'present', label: 'Present', className: 'bg-evergreen' },
  { key: 'late', label: 'Late', className: 'bg-brand-amber' },
  { key: 'absent', label: 'Absent', className: 'bg-alert' },
] as const;

// Animated horizontal bars for present / late / absent.
export function AttendanceBars({ attendance }: { attendance: AttendanceCounts }) {
  const total = Math.max(1, attendance.total);

  return (
    <ul className="space-y-3">
      {BAR_STYLES.map((bar) => {
        const count = attendance[bar.key];
        const pct = Math.round((count / total) * 100);
        return (
          <li key={bar.key}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium text-charcoal">{bar.label}</span>
              <span className="text-charcoal-soft">
                {count} · {pct}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-charcoal/10">
              <motion.div
                className={`h-full rounded-full ${bar.className}`}
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
  );
}

// Late + absent spotlight rows for the story. Names come from the caller.
export function AttendanceSpotlight({
  rows,
}: {
  rows: { userId: string; userFullName: string; status: 'late' | 'absent' }[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-charcoal-soft">Everyone is in. Nothing to follow up on.</p>;
  }

  return (
    <ul className="divide-y divide-charcoal/5">
      {rows.map((row) => (
        <li key={row.userId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          <span className="min-w-0 break-words font-medium text-charcoal">{row.userFullName}</span>
          <AttendanceStatus status={row.status} />
        </li>
      ))}
    </ul>
  );
}
