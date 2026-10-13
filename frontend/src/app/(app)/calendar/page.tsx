'use client';

import { useMemo, useState } from 'react';
import { RoleGate } from '@/components/role-gate';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatGmtOffset, todayIn } from '@/lib/format';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthDays(month: string): { date: string; day: number; holiday: boolean }[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const total = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: total }, (_, index) => {
    const day = index + 1;
    const date = `${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return { date, day, holiday: weekday === 5 || weekday === 6 };
  });
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthTitle(month: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

function CalendarContent() {
  const { user } = useAuth();
  const today = todayIn(user?.companyTimezone);
  const [month, setMonth] = useState(today.slice(0, 7));
  const days = useMemo(() => monthDays(month), [month]);
  const [year, monthNumber] = month.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const workdays = days.filter((day) => !day.holiday).length;
  const holidays = days.length - workdays;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 sm:space-y-6">
      <section className="overflow-hidden rounded-3xl bg-forest text-white shadow-[0_12px_30px_rgba(28,43,37,0.16)]">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-mint">Calendar</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Calendar</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-mist/80 sm:text-base">
              Working days, holidays, and your monthly schedule in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMonth(today.slice(0, 7))}
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-forest transition-colors hover:bg-mist sm:w-auto"
          >
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 11a8.1 8.1 0 0 0-14.9-4L3 10" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 4v6h6M4 13a8.1 8.1 0 0 0 14.9 4L21 14" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 20v-6h-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Today
          </button>
        </div>
      </section>

      <nav aria-label="Calendar sections" className="slim-scroll flex min-w-0 gap-2 overflow-x-auto border-b border-charcoal/10 pb-1">
        <span className="inline-flex min-h-11 shrink-0 items-center rounded-xl border-2 border-evergreen bg-white px-4 py-2 text-sm font-semibold text-evergreen">
          Holiday calendar
        </span>
      </nav>

      <section className="space-y-5 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:space-y-6 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-charcoal sm:text-xl">Holiday calendar</h2>
            <p className="mt-1 text-sm text-charcoal-soft">
              Friday and Saturday are company holidays. Times use {formatGmtOffset(user?.companyTimezone)}.
            </p>
          </div>
          <label className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-charcoal/15 bg-white px-3 text-sm text-charcoal sm:w-auto">
            <span className="sr-only">Choose calendar month</span>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value || today.slice(0, 7))}
              className="min-h-9 min-w-0 flex-1 bg-transparent outline-none sm:w-36 sm:flex-none"
              aria-label="Choose calendar month"
            />
          </label>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, -1))}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-charcoal/15 px-3 text-xl text-charcoal transition-colors hover:bg-mist"
              aria-label="Previous month"
            >
              ‹
            </button>
            <p className="min-w-36 text-center font-semibold text-charcoal">{monthTitle(month)}</p>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-charcoal/15 px-3 text-xl text-charcoal transition-colors hover:bg-mist"
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 text-xs sm:w-auto sm:min-w-56">
            <div className="rounded-xl bg-mist/70 px-3 py-2.5">
              <span className="block text-charcoal-soft">Working days</span>
              <span className="mt-0.5 block text-base font-semibold text-charcoal">{workdays}</span>
            </div>
            <div className="rounded-xl bg-mist/70 px-3 py-2.5">
              <span className="block text-charcoal-soft">Holidays</span>
              <span className="mt-0.5 block text-base font-semibold text-charcoal">{holidays}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-charcoal-soft sm:py-2 sm:text-xs">
              {weekday}
            </div>
          ))}
          {Array.from({ length: firstWeekday }, (_, index) => (
            <div key={`empty-${index}`} className="min-h-20 rounded-xl sm:min-h-24" aria-hidden="true" />
          ))}
          {days.map((day) => {
            const isToday = day.date === today;
            return (
              <div
                key={day.date}
                className={`min-h-20 rounded-xl border p-2.5 text-sm transition-colors sm:min-h-24 sm:p-3 ${day.holiday ? 'border-charcoal/10 bg-mist/60 text-charcoal-soft' : 'border-charcoal/15 bg-white text-charcoal hover:border-evergreen/40 hover:bg-mist/30'} ${isToday ? 'border-evergreen/50 ring-2 ring-evergreen/30 ring-offset-1' : ''}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 font-semibold ${isToday ? 'bg-evergreen text-white' : 'text-charcoal'}`}>
                    {day.day}
                  </span>
                  {day.holiday && <span className="hidden text-[10px] font-medium sm:inline">Holiday</span>}
                </div>
                {day.holiday && <span className="mt-2 block text-[10px] sm:hidden">Holiday</span>}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-4 border-t border-charcoal/10 pt-4 text-xs text-charcoal-soft">
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-evergreen" />Today</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-mist ring-1 ring-charcoal/10" />Friday/Saturday holiday</span>
        </div>
      </section>

      <p className="text-xs text-charcoal-soft">Today is {formatDate(today)}.</p>
    </div>
  );
}

export default function CalendarPage() {
  return <RoleGate allow={['employee']}><CalendarContent /></RoleGate>;
}
