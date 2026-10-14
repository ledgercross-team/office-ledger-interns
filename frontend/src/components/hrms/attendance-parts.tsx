'use client';

import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import type { AttendanceCorrectionEntry, AttendanceDayEntry, AttendanceDayStatus } from '@/lib/hrms/types';

const STATUS_LABEL: Record<AttendanceDayStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  on_leave: 'On leave',
  holiday: 'Holiday',
  weekend: 'Weekend',
};

const STATUS_CLASS: Record<AttendanceDayStatus, string> = {
  present: 'bg-evergreen/10 text-forest',
  late: 'bg-amber-100 text-amber-900',
  absent: 'bg-alert-deep/10 text-alert-deep',
  on_leave: 'bg-sky-100 text-sky-900',
  holiday: 'bg-mist text-charcoal-soft',
  weekend: 'bg-mist text-charcoal-soft',
};

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';

export function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

export function StatusPill({ status }: { status: AttendanceDayStatus | null }) {
  if (!status) return <span className="text-xs text-charcoal-soft">—</span>;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function time(value: string | null): string {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

export function hours(minutes: number | null): string {
  return minutes === null ? '—' : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Month table. onCorrect is given only on the person's own view. */
export function MonthTable({
  days,
  corrections,
  onCorrect,
}: {
  days: AttendanceDayEntry[];
  corrections: AttendanceCorrectionEntry[];
  onCorrect?: (day: AttendanceDayEntry) => void;
}) {
  const byDate = new Map<string, AttendanceCorrectionEntry[]>();
  for (const c of corrections) byDate.set(c.workDate, [...(byDate.get(c.workDate) ?? []), c]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-charcoal/10 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-charcoal-soft">
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
          {days.map((d) => (
            <tr key={d.date} className="border-t border-charcoal/10 align-top">
              <td className="p-3 whitespace-nowrap">
                {new Date(`${d.date}T00:00:00`).toLocaleDateString([], {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </td>
              <td className="p-3">
                <StatusPill status={d.status} />
                {d.holiday && <span className="ml-2 text-xs text-charcoal-soft">{d.holiday}</span>}
                {d.autoCheckedOut && (
                  <span className="ml-2 text-xs text-alert-deep">Missing check-out</span>
                )}
                {d.corrected && <span className="ml-2 text-xs text-charcoal-soft">Corrected</span>}
                {(byDate.get(d.date) ?? []).map((c) => (
                  <p key={c.requestId} className="mt-1 text-xs text-charcoal-soft">
                    Correction {c.status === 'applied' ? 'applied' : c.status}
                    {c.original?.status ? ` (was ${c.original.status}, in ${time(c.original.check_in_at ?? null)})` : ''}
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
                    className="text-xs text-forest hover:underline"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4" role="dialog" aria-modal="true">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4">
        <h2 className="font-medium text-charcoal">Correct {day.date}</h2>
        <p className="text-xs text-charcoal-soft">
          This is a request. Your lead or the COO decides, and the original entry is kept.
        </p>
        <label className="block space-y-1 text-sm text-charcoal">
          Check-in time
          <input name="checkIn" type="time" className={input} />
        </label>
        <label className="block space-y-1 text-sm text-charcoal">
          Check-out time
          <input name="checkOut" type="time" className={input} />
        </label>
        <label className="block space-y-1 text-sm text-charcoal">
          Reason (required)
          <textarea name="reason" required rows={2} maxLength={1000} className={input} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-alert-deep">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={file.isPending}
            className="rounded-xl bg-evergreen px-3 py-1.5 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60"
          >
            Send request
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm hover:bg-mist/60"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
