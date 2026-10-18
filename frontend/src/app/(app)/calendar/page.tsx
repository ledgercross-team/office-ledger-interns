'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { MemberChips, MemberSearch, type MemberOption } from '@/components/hrms/member-search';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { meetingProblem } from '@/lib/hrms/meeting';
import { to12Hour } from '@/lib/hrms/time';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { cn } from '@/lib/cn';
import type { CalendarFeed, CalendarItem, HrmsMeeting, HrmsOrg } from '@/lib/hrms/types';

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';
const primary =
  'rounded-xl bg-evergreen px-3 py-1.5 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60';
const secondary =
  'rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm hover:bg-mist/60 disabled:opacity-60';

const KIND_CLASS: Record<CalendarItem['kind'], string> = {
  task_due: 'bg-warning-soft text-warning-fg',
  meeting: 'bg-info-soft text-info-fg',
  leave: 'bg-success-soft text-success-fg',
  holiday: 'bg-primary text-primary-fg',
};
const KIND_LABEL: Record<CalendarItem['kind'], string> = {
  task_due: 'Task due',
  meeting: 'Meeting',
  leave: 'Leave',
  holiday: 'Holiday',
};
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
];

/** A task opens its page, a meeting its dialog; holidays and leave are read-only. */
function ItemLabel({
  item,
  className,
  onMeeting,
}: {
  item: CalendarItem;
  className?: string;
  onMeeting: (id: string) => void;
}) {
  if (item.kind === 'task_due' && item.refId) {
    return (
      <Link href={`/tasks/${item.refId}`} className={className} title={label(item)}>
        {label(item)}
      </Link>
    );
  }
  if (item.kind === 'meeting' && item.refId) {
    return (
      <button
        type="button"
        onClick={() => onMeeting(item.refId!)}
        className={className}
        title={label(item)}
      >
        {label(item)}
      </button>
    );
  }
  return (
    <span className={className} title={label(item)}>
      {label(item)}
    </span>
  );
}

/** Binding rings along the top of the page, like a wall calendar. */
function Rings() {
  return (
    <div aria-hidden className="flex justify-between gap-1 bg-primary px-4 pt-2 sm:px-6">
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'h-3.5 w-1 rounded-full bg-surface-raised shadow-[0_1px_1px_rgb(0_0_0/0.25)]',
            i >= 14 && 'hidden sm:block',
          )}
        />
      ))}
    </div>
  );
}

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The calendar days an item covers, in the viewer's own zone (the API sends it already). */
function daysOf(item: CalendarItem): string[] {
  if (item.allDay && item.startDate && item.endDate) {
    const out: string[] = [];
    for (let d = item.startDate; d <= item.endDate && out.length < 62; d = addDays(d, 1))
      out.push(d);
    return out;
  }
  return [item.startsAtLocal.slice(0, 10)];
}

function label(item: CalendarItem): string {
  const t = item.allDay ? '' : `${to12Hour(item.startsAtLocal)} `;
  return `${t}${item.title}${item.member ? ` · ${item.member.fullName}` : ''}`;
}

function MeetingDialog({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const meeting = useQuery({
    queryKey: ['hrms', 'meeting', id],
    queryFn: () => hrmsFetch<HrmsMeeting>(`/meetings/${id}`),
  });
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'meeting', id] });
    onChanged();
  };
  const respond = useMutation({
    mutationFn: (response: 'accepted' | 'declined') =>
      hrmsFetch(`/meetings/${id}/respond`, { method: 'POST', body: { response } }),
    onSuccess: done,
    onError: (e) => setError(message(e)),
  });
  const cancel = useMutation({
    mutationFn: () => hrmsFetch(`/meetings/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      done();
      onClose();
    },
    onError: (e) => setError(message(e)),
  });
  const m = meeting.data;
  const mine = m?.invitees.find((i) => i.memberId === session?.activeMemberId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4">
        {!m && <p className="text-sm text-charcoal-soft">Loading…</p>}
        {m && (
          <>
            <h2 className="font-medium text-charcoal">{m.title}</h2>
            <p className="text-sm text-charcoal">
              {m.startsAtLocal.slice(0, 10)} {to12Hour(m.startsAtLocal)} to{' '}
              {to12Hour(m.endsAtLocal)} ({m.timezone})
            </p>
            <p className="text-sm text-charcoal">
              {m.meetingLink ? (
                <a
                  href={m.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-forest hover:underline"
                >
                  Join the meeting
                </a>
              ) : (
                m.location
              )}
            </p>
            {m.description && <p className="text-sm text-charcoal">{m.description}</p>}
            <p className="text-xs text-charcoal-soft">Organised by {m.createdBy.fullName}</p>
            <ul className="text-sm text-charcoal">
              {m.invitees.map((i) => (
                <li key={i.memberId}>
                  {i.fullName} <span className="text-xs text-charcoal-soft">{i.response}</span>
                </li>
              ))}
            </ul>
            {m.cancelled && <p className="text-sm text-alert-deep">This meeting is cancelled.</p>}
            <div className="flex flex-wrap gap-2">
              {mine && !m.cancelled && (
                <>
                  <button
                    type="button"
                    onClick={() => respond.mutate('accepted')}
                    className={primary}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => respond.mutate('declined')}
                    className={secondary}
                  >
                    Decline
                  </button>
                </>
              )}
              {m.canEdit && (
                <button type="button" onClick={() => cancel.mutate()} className={secondary}>
                  Cancel meeting
                </button>
              )}
              <button type="button" onClick={onClose} className={secondary}>
                Close
              </button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-alert-deep">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function NewMeeting({ onDone }: { onDone: () => void }) {
  const [where, setWhere] = useState<'link' | 'location'>('link');
  const [chosen, setChosen] = useState<MemberOption[]>([]);
  const invitees = chosen.map((m) => m.id);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { session } = useHrmsAuth();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const start = new Date(String(f.get('start')));
    const end = new Date(String(f.get('end')));
    const problem = meetingProblem(
      start,
      end,
      where === 'link' ? String(f.get('place')).trim() : null,
    );
    if (problem) {
      setError(problem);
      return;
    }
    // Typed in the browser's zone, sent as an exact instant.
    const at = (k: string) => new Date(String(f.get(k))).toISOString();
    setError(null);
    setPending(true);
    try {
      await hrmsFetch('/meetings', {
        method: 'POST',
        body: {
          title: String(f.get('title')).trim(),
          description: String(f.get('description') ?? '').trim() || undefined,
          startsAt: at('start'),
          endsAt: at('end'),
          meetingLink: where === 'link' ? String(f.get('place')).trim() : undefined,
          location: where === 'location' ? String(f.get('place')).trim() : undefined,
          inviteeIds: invitees,
        },
      });
      form.reset();
      setChosen([]);
      onDone();
    } catch (err) {
      setError(message(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-lg space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4"
    >
      <h2 className="font-medium text-charcoal">New meeting</h2>
      <input name="title" required maxLength={200} placeholder="Title" className={input} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm text-charcoal">
          Starts
          <input name="start" type="datetime-local" required className={input} />
        </label>
        <label className="block space-y-1 text-sm text-charcoal">
          Ends
          <input name="end" type="datetime-local" required className={input} />
        </label>
      </div>
      <div className="flex gap-4 text-sm text-charcoal">
        <label className="flex items-center gap-2">
          <input type="radio" checked={where === 'link'} onChange={() => setWhere('link')} /> Online
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={where === 'location'}
            onChange={() => setWhere('location')}
          />{' '}
          In person
        </label>
      </div>
      <input
        name="place"
        required
        placeholder={where === 'link' ? 'https://…' : 'Room or address'}
        className={input}
      />
      <textarea name="description" rows={2} placeholder="Notes (optional)" className={input} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-charcoal">Invite</legend>
        <MemberSearch
          label="Add people"
          excludeIds={[...invitees, ...(session?.activeMemberId ? [session.activeMemberId] : [])]}
          onSelect={(m) => setChosen((list) => [...list, m])}
        />
        <MemberChips
          members={chosen}
          onRemove={(id) => setChosen((list) => list.filter((m) => m.id !== id))}
          emptyText="Nobody invited yet."
        />
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending || invitees.length === 0} className={primary}>
        {pending ? 'Saving…' : 'Create meeting'}
      </button>
    </form>
  );
}

export default function CalendarPage() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const canTeam = session?.role !== 'employee';
  const canMeet = session?.role === 'ceo' || session?.role === 'coo' || session?.role === 'manager';
  const [view, setView] = useState<'month' | 'week'>('month');
  const today = new Date().toISOString().slice(0, 10);
  const [anchor, setAnchor] = useState(today);
  const [team, setTeam] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const org = useQuery({
    queryKey: ['hrms', 'org', session?.activeMemberId],
    queryFn: () => hrmsFetch<HrmsOrg>('/org'),
    enabled: Boolean(session?.org),
    retry: false,
  });
  // ISO weekday numbers (1 Mon … 7 Sun) the CEO marked as weekend; Sat/Sun until loaded.
  const weekend = new Set(org.data?.settings.weekendDays ?? [6, 7]);
  const isWeekend = (d: string) =>
    weekend.has(((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1);

  let from: string;
  let to: string;
  if (view === 'month') {
    from = `${anchor.slice(0, 7)}-01`;
    const next = new Date(`${from}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    to = next.toISOString().slice(0, 10);
  } else {
    const dow = new Date(`${anchor}T00:00:00Z`).getUTCDay();
    from = addDays(anchor, -dow);
    to = addDays(from, 7);
  }
  // Fetch a day either side so zone shifts at the edges are covered.
  const feed = useQuery({
    queryKey: ['hrms', 'calendar', session?.activeMemberId, from, to, team],
    queryFn: () =>
      hrmsFetch<CalendarFeed>(
        `/calendar?from=${addDays(from, -1)}&to=${addDays(to, 1)}${team ? '&scope=team' : ''}`,
      ),
    enabled: Boolean(session?.activeMemberId),
  });

  const byDay = new Map<string, CalendarItem[]>();
  for (const item of feed.data?.items ?? []) {
    for (const d of daysOf(item)) byDay.set(d, [...(byDay.get(d) ?? []), item]);
  }
  const days: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  const lead = view === 'month' ? new Date(`${from}T00:00:00Z`).getUTCDay() : 0;

  const step = (n: number) => {
    if (view === 'week') return setAnchor(addDays(anchor, 7 * n));
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setAnchor(d.toISOString().slice(0, 10));
  };
  const monthIdx = Number(from.slice(5, 7)) - 1;
  const title =
    view === 'month'
      ? `${MONTHS[monthIdx]} ${from.slice(0, 4)}`
      : `Week of ${Number(from.slice(8))} ${MONTHS[monthIdx]} ${from.slice(0, 4)}`;
  const ctl =
    'inline-flex min-h-9 items-center justify-center rounded-full border border-primary-fg/40 px-3 text-sm font-medium text-primary-fg hover:bg-primary-fg/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fg';

  const selected = picked ?? (days.includes(today) ? today : null);
  const agenda = days
    .flatMap((d) => (byDay.get(d) ?? []).map((item) => ({ d, item })))
    .filter(({ d, item }) => item.kind !== 'holiday' || item.startDate === d || d === from);

  return (
    <>
      <section
        aria-label="Calendar"
        className="overflow-hidden rounded-card border border-border bg-surface-raised shadow-float"
      >
        <Rings />
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-primary px-4 pb-4 pt-3 text-primary-fg sm:px-6">
          <h1 className="mr-auto text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <button type="button" onClick={() => step(-1)} className={ctl} aria-label="Previous">
            ‹
          </button>
          <button type="button" onClick={() => setAnchor(today)} className={ctl}>
            Today
          </button>
          <button type="button" onClick={() => step(1)} className={ctl} aria-label="Next">
            ›
          </button>
          <button
            type="button"
            onClick={() => setView(view === 'month' ? 'week' : 'month')}
            className={ctl}
          >
            {view === 'month' ? 'Week view' : 'Month view'}
          </button>
          {canTeam && (
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={team}
                onChange={(e) => setTeam(e.target.checked)}
                className="size-4 accent-white"
              />
              Team
            </label>
          )}
        </header>

        <div className="grid grid-cols-7">
          {WEEKDAYS.map((name, i) => (
            <div
              key={name}
              className={cn(
                'border-b border-border py-2 text-center text-xs font-bold sm:text-sm',
                weekend.has(i === 0 ? 7 : i) ? 'text-primary' : 'text-fg',
              )}
            >
              <span className="sm:hidden">{name.slice(0, 1)}</span>
              <span className="hidden sm:inline">{name}</span>
            </div>
          ))}
          {Array.from({ length: lead }).map((_, i) => (
            <div
              key={`pad-${i}`}
              className="min-h-16 border-b border-r border-border sm:min-h-24"
            />
          ))}
          {days.map((d, idx) => {
            const items = byDay.get(d) ?? [];
            const holiday = items.find((x) => x.kind === 'holiday');
            const red = isWeekend(d) || Boolean(holiday);
            const isToday = d === today;
            return (
              <div
                key={d}
                onClick={() => setPicked(d)}
                className={cn(
                  'min-h-16 cursor-pointer border-b border-r border-border p-1 transition-colors hover:bg-surface-sunken/60 sm:min-h-24 sm:p-2',
                  d === selected &&
                    'bg-primary-soft outline outline-2 -outline-offset-2 outline-primary',
                  (lead + idx) % 7 === 6 && 'border-r-0',
                  holiday && 'bg-primary-soft/50',
                  view === 'week' && 'min-h-40',
                )}
              >
                <button
                  type="button"
                  aria-pressed={d === selected}
                  className={cn(
                    'inline-flex size-8 items-center justify-center rounded-full text-lg font-bold tabular-nums focus-visible:outline-2 focus-visible:outline-primary sm:size-10 sm:text-2xl',
                    red ? 'text-primary' : 'text-fg',
                    isToday && 'bg-primary text-primary-fg',
                  )}
                  aria-label={`${d}${holiday ? `, holiday: ${holiday.title}` : ''}${isToday ? ', today' : ''}${items.length ? `, ${items.length} items` : ''}`}
                >
                  {Number(d.slice(8))}
                </button>
                <ul className="mt-1 hidden space-y-0.5 sm:block">
                  {items.slice(0, view === 'week' ? 12 : 3).map((item, i) => (
                    <li key={`${item.kind}-${item.refId}-${i}`}>
                      <ItemLabel
                        item={item}
                        onMeeting={setOpen}
                        className={cn(
                          'block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium',
                          KIND_CLASS[item.kind],
                        )}
                      />
                    </li>
                  ))}
                  {items.length > (view === 'week' ? 12 : 3) && (
                    <li className="px-1 text-xs text-fg-muted">
                      +{items.length - (view === 'week' ? 12 : 3)} more
                    </li>
                  )}
                </ul>
                {items.length > 0 && (
                  <div aria-hidden className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                    {items.slice(0, 3).map((item, i) => (
                      <span
                        key={i}
                        className={cn('size-1.5 rounded-full', KIND_CLASS[item.kind])}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-xs text-fg-muted sm:px-6">
          {(Object.keys(KIND_LABEL) as CalendarItem['kind'][]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-full', KIND_CLASS[k])} />
              {KIND_LABEL[k]}
            </span>
          ))}
          <span className="ml-auto">
            Red dates are weekends and holidays set by your CEO
            {feed.data ? ` · times in ${feed.data.timezone}` : ''}
          </span>
        </footer>
      </section>

      {feed.error && (
        <p role="alert" className="text-sm text-danger-fg">
          {message(feed.error)}
        </p>
      )}

      {selected && (
        <section
          aria-label="Selected day"
          className="space-y-2 rounded-card border border-border bg-surface p-4"
        >
          <h2 className="text-lg font-bold text-fg">
            {new Date(`${selected}T00:00:00Z`).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: 'UTC',
            })}
            {selected === today && (
              <span className="ml-2 text-sm font-medium text-primary">Today</span>
            )}
          </h2>
          {(byDay.get(selected) ?? []).length === 0 && (
            <p className="text-sm text-fg-muted">
              {isWeekend(selected)
                ? 'Weekend. Nothing scheduled.'
                : 'No tasks, meetings or leave on this day.'}
            </p>
          )}
          <ul className="space-y-2">
            {(byDay.get(selected) ?? []).map((item, i) => (
              <li
                key={`${item.kind}-${item.refId}-${i}`}
                className="flex flex-wrap items-center gap-2"
              >
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    KIND_CLASS[item.kind],
                  )}
                >
                  {item.kind === 'task_due' ? 'Deadline' : KIND_LABEL[item.kind]}
                </span>
                <ItemLabel
                  item={item}
                  onMeeting={setOpen}
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium text-fg hover:underline"
                />
                {item.kind === 'task_due' && (
                  <span className="text-xs text-fg-muted">due {to12Hour(item.startsAtLocal)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Agenda" className="space-y-2">
        <h2 className="text-lg font-bold text-fg">
          {view === 'month' ? 'This month' : 'This week'}
        </h2>
        {feed.data && agenda.length === 0 && (
          <p className="text-sm text-fg-muted">Nothing scheduled.</p>
        )}
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {agenda.map(({ d, item }, i) => (
            <li
              key={`${d}-${item.kind}-${item.refId}-${i}`}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span
                className={cn(
                  'w-14 shrink-0 text-sm font-bold tabular-nums',
                  isWeekend(d) || item.kind === 'holiday' ? 'text-primary' : 'text-fg',
                )}
              >
                {Number(d.slice(8))} {MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)}
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  KIND_CLASS[item.kind],
                )}
              >
                {KIND_LABEL[item.kind]}
              </span>
              <ItemLabel
                item={item}
                onMeeting={setOpen}
                className="min-w-0 flex-1 truncate text-left text-sm text-fg hover:underline"
              />
            </li>
          ))}
        </ul>
      </section>

      {canMeet && (
        <NewMeeting
          onDone={() => void queryClient.invalidateQueries({ queryKey: ['hrms', 'calendar'] })}
        />
      )}
      {open && (
        <MeetingDialog
          id={open}
          onClose={() => setOpen(null)}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ['hrms', 'calendar'] })}
        />
      )}
    </>
  );
}
