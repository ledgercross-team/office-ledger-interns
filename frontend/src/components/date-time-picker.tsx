'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { DateInput } from '@/components/date-input';
import { toZonedInput } from '@/lib/format';

interface DateTimePickerProps {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  min: string;
  max: string;
  timezone: string;
  timezoneLabel?: string;
}

function splitValue(value: string): { date: string; time: string } {
  const [date = '', time = ''] = value.split('T');
  return { date, time: time.slice(0, 5) };
}

function displayValue(value: string): string {
  const { date, time } = splitValue(value);
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day || !time) return 'Select date and time';
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year} · ${time}`;
}

function isHolidayDate(date: string): boolean {
  if (!date) return false;
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 5 || weekday === 6;
}

export function DateTimePicker({
  id,
  name,
  value,
  onChange,
  min,
  max,
  timezone,
  timezoneLabel,
}: DateTimePickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const minDate = min.slice(0, 10);
  const minTime = min.slice(11, 16);
  const maxDate = max.slice(0, 10);
  const draftIsHoliday = isHolidayDate(draftDate);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  function openPicker() {
    const current = splitValue(value || min);
    setDraftDate(current.date);
    setDraftTime(current.time);
    setOpen(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  function confirm() {
    if (!draftDate || !draftTime || draftIsHoliday) return;
    onChange(`${draftDate}T${draftTime}`);
    setOpen(false);
  }

  function setToday() {
    const today = toZonedInput(new Date().toISOString(), timezone);
    setDraftDate(today.slice(0, 10));
    setDraftTime(today.slice(11, 16));
  }

  return (
    <div ref={pickerRef} className="relative">
      <input type="hidden" id={id} name={name} value={value} />
      <button
        type="button"
        id={`${id}-button`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `Deadline ${displayValue(value)}` : 'Choose deadline'}
        onClick={openPicker}
        onKeyDown={onKeyDown}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2 text-left outline-none transition-colors focus:border-evergreen ${value ? 'border-charcoal/15 text-charcoal' : 'border-charcoal/15 text-charcoal-soft'}`}
      >
        <span className="truncate">{displayValue(value)}</span>
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      {open && (
        <div role="dialog" aria-label="Choose deadline" className="absolute top-full left-1/2 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_12px_36px_rgba(28,43,37,0.16)] sm:left-0 sm:translate-x-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-charcoal">Set deadline</p>
              <p className="mt-0.5 text-xs text-charcoal-soft">Using {timezoneLabel ?? timezone}</p>
            </div>
            <button
              type="button"
              aria-label="Close deadline picker"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 py-1 text-lg leading-none text-charcoal-soft hover:bg-mist hover:text-charcoal"
            >
              ×
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 text-sm font-medium text-charcoal">
              <span className="block">Date</span>
              <DateInput
                id={`${id}-date`}
                value={draftDate}
                min={minDate}
                max={maxDate}
                onChange={(event) => setDraftDate(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-charcoal/15 bg-white font-normal outline-none"
              />
            </div>
            <label className="space-y-1 text-sm font-medium text-charcoal">
              <span className="block">Time</span>
              <input
                type="time"
                value={draftTime}
                min={draftDate === minDate ? minTime : undefined}
                onChange={(event) => setDraftTime(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-charcoal/15 bg-white px-3 py-2 font-normal text-charcoal outline-none focus:border-evergreen"
              />
            </label>
          </div>

          {draftIsHoliday && (
            <p role="status" className="mt-3 text-xs font-medium text-amber-deep">
              Friday and Saturday are holidays. Choose another date.
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-charcoal/10 pt-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-lg px-2.5 py-2 text-sm font-medium text-charcoal-soft hover:bg-charcoal/5 hover:text-charcoal"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={setToday}
                className="inline-flex min-h-11 items-center justify-center rounded-lg px-2.5 py-2 text-sm font-medium text-evergreen hover:bg-mist"
              >
                Today
              </button>
            </div>
            <button
              type="button"
              onClick={confirm}
              disabled={!draftDate || !draftTime || draftIsHoliday}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-evergreen px-4 py-2 text-sm font-semibold text-white hover:bg-evergreen-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
