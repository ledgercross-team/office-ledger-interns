'use client';

import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import {
  Badge,
  Banner,
  Button,
  Dialog,
  Textarea,
  controlClass,
  labelClass,
  secondaryActionClass,
} from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { formatTime } from '@/lib/hrms/time';
import type {
  AttendanceCorrectionEntry,
  AttendanceDayEntry,
  AttendanceDayStatus,
} from '@/lib/hrms/types';

const STATUS_LABEL: Record<AttendanceDayStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  on_leave: 'On leave',
  holiday: 'Holiday',
  weekend: 'Weekend',
};

const STATUS_TONE: Record<
  AttendanceDayStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  on_leave: 'info',
  holiday: 'neutral',
  weekend: 'neutral',
};

const input = controlClass;

export function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

export function StatusPill({ status }: { status: AttendanceDayStatus | null }) {
  return status ? (
    <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
  ) : (
    <span className="text-xs text-fg-muted">—</span>
  );
}

export function time(value: string | null): string {
  return formatTime(value);
}

export function hours(minutes: number | null): string {
  return minutes === null
    ? '—'
    : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Month table. onCorrect is given only on the person's own view. */
export function MonthTable({
  days,
  corrections,
  todayDate,
  onCorrect,
}: {
  days: AttendanceDayEntry[];
  corrections: AttendanceCorrectionEntry[];
  todayDate?: string;
  onCorrect?: (day: AttendanceDayEntry) => void;
}) {
  // Newest first, and no rows for days that have not happened yet.
  const shown = [...days]
    .filter((d) => !todayDate || d.date <= todayDate)
    .sort((a, b) => b.date.localeCompare(a.date));
  const byDate = new Map<string, AttendanceCorrectionEntry[]>();
  for (const c of corrections) byDate.set(c.workDate, [...(byDate.get(c.workDate) ?? []), c]);

  return (
    <div className="space-y-3">
      <div className="hidden overflow-x-auto rounded-card border border-border bg-surface lg:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-fg-muted">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Status</th>
              <th className="p-3">In</th>
              <th className="p-3">Out</th>
              <th className="p-3">Worked</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr
                key={d.date}
                className={`border-t border-border align-top ${d.date === todayDate ? 'bg-surface-sunken/50' : ''}`}
              >
                <td className="p-3 whitespace-nowrap">
                  {new Date(`${d.date}T00:00:00`).toLocaleDateString([], {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                  {d.date === todayDate && (
                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-fg">
                      Today
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <StatusPill status={d.status} />
                  {d.holiday && <span className="ml-2 text-xs text-fg-muted">{d.holiday}</span>}
                  {d.autoCheckedOut && (
                    <span className="ml-2 text-xs text-danger-fg">Missing check-out</span>
                  )}
                  {d.corrected && <span className="ml-2 text-xs text-fg-muted">Corrected</span>}
                  {(byDate.get(d.date) ?? []).map((c) => (
                    <p key={c.requestId} className="mt-1 text-xs text-fg-muted">
                      Correction {c.status === 'applied' ? 'applied' : c.status}
                      {c.original?.status
                        ? ` (was ${c.original.status}, in ${time(c.original.check_in_at ?? null)})`
                        : ''}
                      {c.decisionReason ? `: ${c.decisionReason}` : ''}
                    </p>
                  ))}
                </td>
                <td className="p-3">{time(d.checkInAt)}</td>
                <td className="p-3">{time(d.checkOutAt)}</td>
                <td className="p-3">{hours(d.workedMinutes)}</td>
                <td className="p-3 text-right">
                  {onCorrect && d.status !== 'weekend' && d.status !== 'holiday' && (
                    <button
                      type="button"
                      onClick={() => onCorrect(d)}
                      className="min-h-10 text-sm text-primary hover:underline"
                    >
                      Correct
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 lg:hidden">
        {shown.map((d) => (
          <article
            key={d.date}
            className={`rounded-card border border-border bg-surface p-4 ${d.date === todayDate ? 'ring-2 ring-primary/20' : ''}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-fg">
                  {new Date(`${d.date}T00:00:00`).toLocaleDateString([], {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
                {d.date === todayDate && (
                  <span className="text-xs font-medium text-primary">Today</span>
                )}
              </div>
              <StatusPill status={d.status} />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 text-sm">
              <div>
                <dt className="text-xs text-fg-muted">In</dt>
                <dd className="mt-0.5 tabular-nums text-fg">{time(d.checkInAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Out</dt>
                <dd className="mt-0.5 tabular-nums text-fg">{time(d.checkOutAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Worked</dt>
                <dd className="mt-0.5 tabular-nums text-fg">{hours(d.workedMinutes)}</dd>
              </div>
            </dl>
            <div className="mt-3 space-y-1 text-xs text-fg-muted">
              {d.holiday && <p>{d.holiday}</p>}
              {d.autoCheckedOut && <p className="text-danger-fg">Missing check-out</p>}
              {d.corrected && <p>Corrected</p>}
              {(byDate.get(d.date) ?? []).map((c) => (
                <p key={c.requestId}>
                  Correction {c.status === 'applied' ? 'applied' : c.status}
                  {c.decisionReason ? `: ${c.decisionReason}` : ''}
                </p>
              ))}
            </div>
            {onCorrect && d.status !== 'weekend' && d.status !== 'holiday' && (
              <button
                type="button"
                onClick={() => onCorrect(d)}
                className="mt-3 min-h-10 text-sm font-medium text-primary hover:underline"
              >
                Correct attendance
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

/** A time field with an OK button: confirms the time and closes the browser's picker. */
function TimeField({ name, label }: { name: string; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={labelClass}>
      <label htmlFor={`correction-${name}`}>{label}</label>
      <div className="flex gap-2">
        <input
          ref={ref}
          id={`correction-${name}`}
          name={name}
          type="time"
          className={input}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              ref.current?.blur();
            }
          }}
        />
        <button
          type="button"
          onClick={() => ref.current?.blur()}
          className={`${secondaryActionClass} shrink-0`}
        >
          OK
        </button>
      </div>
    </div>
  );
}

export function CorrectionDialog({
  day,
  onClose,
  onDone,
}: {
  day: AttendanceDayEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const { session } = useHrmsAuth();
  const isCeo = session?.role === 'ceo';
  const file = useMutation({
    mutationFn: (body: Record<string, string | undefined>) =>
      hrmsFetch('/attendance/corrections', { method: 'POST', body }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (err) => setError(message(err)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    // Times are typed in the browser's local zone and sent as exact instants.
    const at = (k: string) => {
      const v = String(f.get(k) ?? '');
      return v ? new Date(`${day.date}T${v}:00`).toISOString() : undefined;
    };
    setError(null);
    file.mutate({
      workDate: day.date,
      checkInAt: at('checkIn'),
      checkOutAt: at('checkOut'),
      reason: String(f.get('reason')).trim(),
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Correct ${day.date}`}
      description={
        isCeo
          ? 'As CEO your correction is applied straight away. The original entry is kept.'
          : 'This is a request. Your lead or the COO decides, and the original entry is kept.'
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <TimeField name="checkIn" label="Check-in time" />
        <TimeField name="checkOut" label="Check-out time" />
        <Textarea
          name="reason"
          label="Reason"
          helperText="Required. Explain what needs to be corrected."
          required
          rows={2}
          maxLength={1000}
        />
        {error && (
          <Banner tone="danger" title="Could not submit correction">
            {error}
          </Banner>
        )}
        <div className="flex gap-2">
          <Button type="submit" loading={file.isPending}>
            {isCeo ? 'Apply correction' : 'Send request'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
