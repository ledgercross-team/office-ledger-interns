'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api-client';
import { errorMessage, formatDate, formatGmtOffset, fromZonedInput, toZonedInput } from '@/lib/format';
import type { AttendanceRecord } from '@/lib/types';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

interface CalendarMonth {
  year: number;
  month: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parseDateTime(value: string): DateTimeParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

function currentDateTime(timezone: string): DateTimeParts {
  const parts = parseDateTime(toZonedInput(new Date().toISOString(), timezone));
  if (parts) return parts;
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours(), minute: now.getMinutes() };
}

function toDateTimeValue(parts: DateTimeParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function shiftMonth(month: CalendarMonth, offset: number): CalendarMonth {
  const date = new Date(month.year, month.month - 1 + offset, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function formatPickerValue(value: string): string {
  const parts = parseDateTime(value);
  if (!parts) return 'Select date and time';
  const hour = parts.hour % 12 || 12;
  const suffix = parts.hour >= 12 ? 'PM' : 'AM';
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}, ${pad(hour)}:${pad(parts.minute)} ${suffix}`;
}

function DateTimePicker({
  id,
  name,
  label,
  value,
  defaultDate,
  timezone,
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  defaultDate?: string;
  timezone: string;
  required?: boolean;
}) {
  const initialParts = parseDateTime(value);
  const [committedValue, setCommittedValue] = useState(value);
  const [draftValue, setDraftValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<CalendarMonth>(
    initialParts
      ? { year: initialParts.year, month: initialParts.month }
      : { year: currentDateTime(timezone).year, month: currentDateTime(timezone).month },
  );

  useEffect(() => {
    // Attendance rows can be refreshed while this editor remains mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCommittedValue(value);
    setDraftValue(value);
    const nextParts = parseDateTime(value);
    if (nextParts) {
      setViewMonth({ year: nextParts.year, month: nextParts.month });
    }
  }, [value]);

  const selected = parseDateTime(draftValue);
  const pickerParts = selected ?? currentDateTime(timezone);
  const firstWeekday = new Date(viewMonth.year, viewMonth.month - 1, 1).getDay();
  const daysInMonth = new Date(viewMonth.year, viewMonth.month, 0).getDate();
  const calendarDays = Array.from({ length: 42 }, (_, index) => index - firstWeekday + 1);

  function openPicker() {
    const now = currentDateTime(timezone);
    const fallbackDate = /^\d{4}-\d{2}-\d{2}$/.test(defaultDate ?? '')
      ? `${defaultDate}T${pad(now.hour)}:${pad(now.minute)}`
      : '';
    const nextParts = parseDateTime(committedValue || fallbackDate) ?? now;
    setDraftValue(committedValue || toDateTimeValue(nextParts));
    setViewMonth({ year: nextParts.year, month: nextParts.month });
    setOpen(true);
  }

  function updateDraft(update: Partial<DateTimeParts>) {
    setDraftValue(toDateTimeValue({ ...pickerParts, ...update }));
  }

  function confirm() {
    setCommittedValue(draftValue);
    setOpen(false);
  }

  function setToday() {
    const today = currentDateTime(timezone);
    setDraftValue(toDateTimeValue(today));
    setViewMonth({ year: today.year, month: today.month });
  }

  return (
    <div className="relative">
      <input type="hidden" id={id} name={name} value={committedValue} required={required} />
      <button
        id={`${id}-trigger`}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-picker`}
        onClick={openPicker}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-charcoal/15 bg-white px-3 py-2 text-left outline-none focus:border-evergreen"
      >
        <span className={committedValue ? 'text-charcoal' : 'text-charcoal-soft'}>
          {formatPickerValue(committedValue)}
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-charcoal-soft">
          <path
            d="M7 3v3M17 3v3M4.5 9.5h15M6 5h12a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div
          id={`${id}-picker`}
          role="dialog"
          aria-label={`${label} date and time picker`}
          className="fixed top-1/2 left-1/2 z-[60] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-charcoal/10 bg-white p-3 shadow-[0_12px_36px_rgba(19,78,58,0.24)]"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-charcoal">
              {MONTHS[viewMonth.month - 1]} {viewMonth.year}
            </p>
            <p className="text-xs text-charcoal-soft">{formatGmtOffset(timezone)}</p>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setViewMonth((month) => shiftMonth(month, -1))}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-charcoal/15 px-2 py-1 text-lg leading-none text-charcoal hover:bg-mist"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setViewMonth((month) => shiftMonth(month, 1))}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-charcoal/15 px-2 py-1 text-lg leading-none text-charcoal hover:bg-mist"
              >
                ›
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs text-charcoal-soft">
                {WEEKDAYS.map((weekday) => (
                  <span key={weekday} className="py-1 font-medium">
                    {weekday}
                  </span>
                ))}
                {calendarDays.map((day, index) => {
                  const inCurrentMonth = day > 0 && day <= daysInMonth;
                  const isSelected =
                    inCurrentMonth &&
                    selected?.year === viewMonth.year &&
                    selected.month === viewMonth.month &&
                    selected.day === day;
                  return (
                    <button
                      key={`${viewMonth.year}-${viewMonth.month}-${index}`}
                      type="button"
                      disabled={!inCurrentMonth}
                      aria-label={inCurrentMonth ? `${MONTHS[viewMonth.month - 1]} ${day}, ${viewMonth.year}` : undefined}
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (inCurrentMonth) {
                          updateDraft({ year: viewMonth.year, month: viewMonth.month, day });
                        }
                      }}
                      className={`min-h-9 rounded-lg py-1 text-sm ${
                        isSelected
                          ? 'bg-evergreen font-semibold text-white'
                          : inCurrentMonth
                            ? 'text-charcoal hover:bg-mist'
                            : 'text-charcoal/20'
                      }`}
                    >
                      {inCurrentMonth ? day : ' '}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-charcoal/10 pt-2">
                {!required ? (
                  <button type="button" onClick={() => setDraftValue('')} className="inline-flex min-h-10 items-center justify-center rounded-lg px-2 py-1 text-sm font-medium text-evergreen hover:bg-mist">
                    Clear
                  </button>
                ) : (
                  <span />
                )}
                <button type="button" onClick={setToday} className="inline-flex min-h-10 items-center justify-center rounded-lg px-2 py-1 text-sm font-medium text-evergreen hover:bg-mist">
                  Today
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-charcoal/10 bg-offwhite p-2">
              <p className="mb-2 text-xs font-semibold text-charcoal">Time</p>
              <div className="space-y-2">
                <label className="block space-y-1 text-xs text-charcoal-soft">
                  Hour
                  <select
                    value={pickerParts.hour % 12 || 12}
                    onChange={(event) => {
                      const hour12 = Number(event.target.value);
                      const hour24 = hour12 % 12 + (pickerParts.hour >= 12 ? 12 : 0);
                      updateDraft({ hour: hour24 });
                    }}
                    className="min-h-10 w-full rounded-lg border border-charcoal/15 bg-white px-2 py-1 text-sm text-charcoal outline-none focus:border-evergreen"
                  >
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                      <option key={hour} value={hour}>
                        {pad(hour)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-xs text-charcoal-soft">
                  Minute
                  <select
                    value={pickerParts.minute}
                    onChange={(event) => updateDraft({ minute: Number(event.target.value) })}
                    className="min-h-10 w-full rounded-lg border border-charcoal/15 bg-white px-2 py-1 text-sm text-charcoal outline-none focus:border-evergreen"
                  >
                    {Array.from({ length: 60 }, (_, minute) => (
                      <option key={minute} value={minute}>
                        {pad(minute)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-xs text-charcoal-soft">
                  AM / PM
                  <select
                    value={pickerParts.hour >= 12 ? 'PM' : 'AM'}
                    onChange={(event) => {
                      const hour12 = pickerParts.hour % 12 || 12;
                      updateDraft({ hour: event.target.value === 'PM' ? hour12 % 12 + 12 : hour12 % 12 });
                    }}
                    className="min-h-10 w-full rounded-lg border border-charcoal/15 bg-white px-2 py-1 text-sm text-charcoal outline-none focus:border-evergreen"
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-charcoal/10 pt-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setDraftValue(committedValue);
                  setOpen(false);
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-lg px-2 py-1.5 text-sm font-medium text-charcoal-soft hover:bg-mist"
              >
                Cancel
              </button>
            </div>
            <button
              type="button"
              onClick={confirm}
              disabled={required && !draftValue}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-evergreen px-4 py-1.5 text-sm font-medium text-white hover:bg-evergreen-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface CorrectionDialogProps {
  record: AttendanceRecord | null;
  userId: string;
  workDate: string;
  personName: string;
  timezone: string;
  onClose: () => void;
}

export function CorrectionDialog({ record, userId, workDate, personName, timezone, onClose }: CorrectionDialogProps) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: { checkInAt: string; checkOutAt?: string; note: string }) =>
      record
        ? apiFetch(`/attendance/${record.id}`, { method: 'PATCH', body })
        : apiFetch('/attendance/corrections', {
            method: 'POST',
            body: { ...body, userId, workDate },
          }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const checkIn = String(form.get('checkInAt'));
    const checkOut = String(form.get('checkOutAt'));

    setError(null);
    if (!checkIn) {
      setError('Check in date and time is required.');
      return;
    }
    if (checkOut && new Date(fromZonedInput(checkOut, timezone)) <= new Date(fromZonedInput(checkIn, timezone))) {
      setError('Check out must be later than check in.');
      return;
    }
    save.mutate({
      checkInAt: fromZonedInput(checkIn, timezone),
      checkOutAt: checkOut ? fromZonedInput(checkOut, timezone) : undefined,
      note: note.trim(),
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="correction-title"
      className="fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
    >
      <form onSubmit={onSubmit} className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl border border-charcoal/10 bg-white p-5 shadow-[0_8px_24px_rgba(19,78,58,0.12)]">
        <h2 id="correction-title" className="break-words font-semibold text-charcoal">
          Edit attendance: {personName}, {formatDate(workDate)}
        </h2>
        <div className="space-y-1">
          <label htmlFor="checkInAt-trigger" className="block text-sm font-medium text-charcoal">
            Check in
          </label>
          <DateTimePicker
            id="checkInAt"
            name="checkInAt"
            label="Check in"
            required
            value={record ? toZonedInput(record.checkInAt, timezone) : ''}
            defaultDate={workDate}
            timezone={timezone}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="checkOutAt-trigger" className="block text-sm font-medium text-charcoal">
            Check out
          </label>
          <DateTimePicker
            id="checkOutAt"
            name="checkOutAt"
            label="Check out"
            value={record?.checkOutAt ? toZonedInput(record.checkOutAt, timezone) : ''}
            defaultDate={workDate}
            timezone={timezone}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="note" className="block text-sm font-medium text-charcoal">
            Note (required)
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            required
            maxLength={500}
            rows={3}
            className="w-full rounded-xl border border-charcoal/15 px-3 py-2 outline-none focus:border-evergreen"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-alert-deep">
            {error}
          </p>
        )}
        <div className="flex flex-col justify-end gap-2 sm:flex-row">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-charcoal/15 px-4 py-2 text-sm font-medium hover:bg-mist sm:w-auto">
            Close
          </button>
          <button
            type="submit"
            disabled={save.isPending || note.trim() === ''}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-evergreen px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-evergreen-dark disabled:opacity-60 sm:w-auto"
          >
            {save.isPending ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </form>
    </div>
  );
}
