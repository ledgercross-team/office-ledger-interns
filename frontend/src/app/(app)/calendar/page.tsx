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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-charcoal sm:text-3xl">Calendar</h1>
        <p className="mt-1 text-sm text-charcoal-soft">Company working calendar in {formatGmtOffset(user?.companyTimezone)}.</p>
      </div>

      <section className="space-y-5 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-charcoal">{monthTitle(month)}</h2>
            <p className="mt-1 text-sm text-charcoal-soft">{workdays} working days · Friday and Saturday are holidays.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-charcoal/15 px-3 text-lg hover:bg-mist" aria-label="Previous month">‹</button>
            <button type="button" onClick={() => setMonth(today.slice(0, 7))} className="min-h-11 rounded-lg border border-charcoal/15 px-3 text-sm font-medium hover:bg-mist">Today</button>
            <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-charcoal/15 px-3 text-lg hover:bg-mist" aria-label="Next month">›</button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAYS.map((weekday) => <div key={weekday} className="py-2 text-center text-xs font-semibold text-charcoal-soft">{weekday}</div>)}
          {Array.from({ length: firstWeekday }, (_, index) => <div key={`empty-${index}`} aria-hidden />)}
          {days.map((day) => {
            const isToday = day.date === today;
            return (
              <div key={day.date} className={`min-h-16 rounded-xl border p-2 text-sm sm:min-h-20 ${day.holiday ? 'border-charcoal/5 bg-mist/60 text-charcoal-soft' : 'border-charcoal/10 bg-white text-charcoal'} ${isToday ? 'ring-2 ring-evergreen ring-offset-1' : ''}`}>
                <div className="flex items-start justify-between gap-1">
                  <span className={isToday ? 'font-bold text-evergreen' : 'font-medium'}>{day.day}</span>
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

      <p className="text-xs text-charcoal-soft">Selected date: {formatDate(today)}</p>
    </div>
  );
}

export default function CalendarPage() {
  return <RoleGate allow={['employee']}><CalendarContent /></RoleGate>;
}
