'use client';

import { motion, useReducedMotion } from 'motion/react';
import { formatDate, formatMinutes } from '@/lib/format';
import type { StatsDay } from '@/lib/types';

export type ChartMode = 'in' | 'out' | 'hours';

const W = 640;
const H = 280;
const PAD = { left: 52, right: 12, top: 16, bottom: 30 };
const GRACE = 15;

const STATUS_CLASS: Record<string, string> = {
  present: 'fill-evergreen',
  late: 'fill-brand-amber',
};

interface Scale {
  min: number;
  max: number;
  ticks: number[];
  label: (value: number) => string;
}

function timeScale(values: number[], extra: number[]): Scale {
  const all = [...values, ...extra];
  const min = Math.floor((Math.min(...all) - 30) / 60) * 60;
  const max = Math.ceil((Math.max(...all) + 30) / 60) * 60;
  const ticks: number[] = [];
  for (let t = min; t <= max; t += 60) ticks.push(t);
  return { min, max, ticks, label: (v) => formatMinutes(v).replace(':00', '') };
}

function hourScale(values: number[]): Scale {
  const max = Math.max(10, Math.ceil(Math.max(...values, 0)));
  return {
    min: 0,
    max,
    ticks: Array.from({ length: Math.floor(max / 2) + 1 }, (_, i) => i * 2),
    label: (v) => `${v}h`,
  };
}

// One chart, three views. Switching `mode` slides every point to its new position, which is
// what makes the scrollytelling feel continuous.
export function AttendanceChart({
  days,
  mode,
  workStartMinutes,
  average,
}: {
  days: StatsDay[];
  mode: ChartMode;
  workStartMinutes: number;
  average: number | null;
}) {
  const reduce = useReducedMotion();
  const transition = { duration: reduce ? 0 : 0.6, ease: 'easeInOut' as const };

  if (days.length === 0) {
    return <p className="py-10 text-center text-sm text-charcoal-soft">No attendance in this window yet.</p>;
  }

  const inValues = days.flatMap((d) => (d.checkInMinutes === null ? [] : [d.checkInMinutes]));
  const outValues = days.flatMap((d) => (d.checkOutMinutes === null ? [] : [d.checkOutMinutes]));
  const hourValues = days.flatMap((d) => (d.hours === null ? [] : [d.hours]));

  const scale =
    mode === 'hours'
      ? hourScale(hourValues)
      : mode === 'in'
        ? timeScale(inValues, [workStartMinutes, workStartMinutes + GRACE])
        : timeScale(outValues.length ? outValues : [workStartMinutes + 480], []);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = innerW / days.length;
  const x = (index: number) => PAD.left + step * index + step / 2;
  const y = (value: number) =>
    PAD.top + innerH - ((value - scale.min) / (scale.max - scale.min)) * innerH;

  const valueOf = (day: StatsDay) =>
    mode === 'in' ? day.checkInMinutes : mode === 'out' ? day.checkOutMinutes : day.hours;
  const barW = Math.max(3, Math.min(18, step * 0.6));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={
        mode === 'in'
          ? 'Check-in time for each day'
          : mode === 'out'
            ? 'Check-out time for each day'
            : 'Hours worked each day'
      }
      className="h-auto w-full"
    >
      {scale.ticks.map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-charcoal/10" />
          <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-charcoal-soft text-[11px]">
            {scale.label(tick)}
          </text>
        </g>
      ))}

      {/* Work start and the 15 minute grace window, on the check-in view only. */}
      {mode === 'in' && (
        <g>
          <motion.rect
            x={PAD.left}
            width={innerW}
            initial={false}
            animate={{ y: y(workStartMinutes + GRACE), height: y(workStartMinutes) - y(workStartMinutes + GRACE) }}
            transition={transition}
            className="fill-brand-amber/15"
          />
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(workStartMinutes)}
            y2={y(workStartMinutes)}
            className="stroke-forest"
            strokeDasharray="5 4"
          />
          <text x={W - PAD.right} y={y(workStartMinutes) - 5} textAnchor="end" className="fill-forest text-[11px]">
            Work starts {formatMinutes(workStartMinutes)}
          </text>
        </g>
      )}
      {mode === 'hours' && (
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(8)}
          y2={y(8)}
          className="stroke-forest"
          strokeDasharray="5 4"
        />
      )}

      {average !== null && mode !== 'hours' && (
        <motion.line
          x1={PAD.left}
          x2={W - PAD.right}
          initial={false}
          animate={{ y1: y(average), y2: y(average) }}
          transition={transition}
          className="stroke-charcoal/50"
          strokeWidth={1.5}
        />
      )}

      {days.map((day, index) => {
        const value = valueOf(day);
        const fillClass = STATUS_CLASS[day.status] ?? 'fill-alert';
        const title = `${formatDate(day.date)}: ${
          day.status === 'absent'
            ? 'absent'
            : mode === 'hours'
              ? `${day.hours ?? '—'} h`
              : formatMinutes(value)
        }`;

        if (day.status === 'absent') {
          return (
            <g key={day.date}>
              <title>{title}</title>
              <text x={x(index)} y={H - PAD.bottom - 6} textAnchor="middle" className="fill-alert text-[13px]">
                ×
              </text>
            </g>
          );
        }
        if (value === null) return null;

        return mode === 'hours' ? (
          <motion.rect
            key={day.date}
            x={x(index) - barW / 2}
            width={barW}
            rx={2}
            className={fillClass}
            initial={false}
            animate={{ y: y(value), height: PAD.top + innerH - y(value) }}
            transition={transition}
          >
            <title>{title}</title>
          </motion.rect>
        ) : (
          <motion.circle
            key={day.date}
            cx={x(index)}
            r={4.5}
            className={fillClass}
            initial={false}
            animate={{ cy: y(value) }}
            transition={transition}
          >
            <title>{title}</title>
          </motion.circle>
        );
      })}

      <text x={PAD.left} y={H - 8} className="fill-charcoal-soft text-[11px]">
        {formatDate(days[0].date)}
      </text>
      <text x={W - PAD.right} y={H - 8} textAnchor="end" className="fill-charcoal-soft text-[11px]">
        {formatDate(days[days.length - 1].date)}
      </text>
    </svg>
  );
}
