'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { CalendarFeed, CalendarItem, HrmsMeeting, HrmsMember, Paginated } from '@/lib/hrms/types';

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';
const primary =
  'rounded-xl bg-evergreen px-3 py-1.5 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60';
const secondary = 'rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm hover:bg-mist/60 disabled:opacity-60';

const KIND_CLASS: Record<CalendarItem['kind'], string> = {
  task_due: 'bg-amber-100 text-amber-900',
  meeting: 'bg-evergreen/10 text-forest',
  leave: 'bg-sky-100 text-sky-900',
  holiday: 'bg-mist text-charcoal-soft',
};

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
    for (let d = item.startDate; d <= item.endDate && out.length < 62; d = addDays(d, 1)) out.push(d);
    return out;
  }
  return [item.startsAtLocal.slice(0, 10)];
}

function label(item: CalendarItem): string {
  const t = item.allDay ? '' : `${item.startsAtLocal.slice(11)} `;
  return `${t}${item.title}${item.member ? ` · ${item.member.fullName}` : ''}`;
}

function MeetingDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4">
        {!m && <p className="text-sm text-charcoal-soft">Loading…</p>}
        {m && (
          <>
            <h2 className="font-medium text-charcoal">{m.title}</h2>
            <p className="text-sm text-charcoal">
              {m.startsAtLocal} to {m.endsAtLocal.slice(11)} ({m.timezone})
            </p>
            <p className="text-sm text-charcoal">
              {m.meetingLink ? (
                <a href={m.meetingLink} target="_blank" rel="noopener noreferrer" className="text-forest hover:underline">
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
                  <button type="button" onClick={() => respond.mutate('accepted')} className={primary}>
                    Accept
                  </button>
                  <button type="button" onClick={() => respond.mutate('declined')} className={secondary}>
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
  const [invitees, setInvitees] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const members = useQuery({
    queryKey: ['hrms', 'members', 'meeting-form'],
    queryFn: () => hrmsFetch<Paginated<HrmsMember>>('/members?status=active&pageSize=100'),
  });
  const { session } = useHrmsAuth();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
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
      setInvitees([]);
      onDone();
    } catch (err) {
      setError(message(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4">
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
          <input type="radio" checked={where === 'location'} onChange={() => setWhere('location')} /> In person
        </label>
      </div>
      <input
        name="place"
        required
        placeholder={where === 'link' ? 'https://…' : 'Room or address'}
        className={input}
      />
      <textarea name="description" rows={2} placeholder="Notes (optional)" className={input} />
      <fieldset className="max-h-40 space-y-1 overflow-y-auto">
        <legend className="text-sm font-medium text-charcoal">Invite</legend>
        {members.data?.items
          .filter((m) => m.id !== session?.activeMemberId)
          .map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm text-charcoal">
              <input
                type="checkbox"
                checked={invitees.includes(m.id)}
                onChange={(e) =>
                  setInvitees((ids) => (e.target.checked ? [...ids, m.id] : ids.filter((id) => id !== m.id)))
                }
              />
              {m.fullName}
            </label>
          ))}
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
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [team, setTeam] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  let from: string;
  let to: string;
  if (view === 'month') {
    from = `${anchor.slice(0, 7)}-01`;
    const next = new Date(`${from}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    to = next.toISOString().slice(0, 10);
  } else {
    const dow = (new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7;
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
  const lead = view === 'month' ? (new Date(`${from}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;

  const step = (n: number) => {
    if (view === 'week') return setAnchor(addDays(anchor, 7 * n));
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setAnchor(d.toISOString().slice(0, 10));
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold text-charcoal">Calendar</h1>
        <button type="button" onClick={() => step(-1)} className={secondary} aria-label="Previous">
          ‹
        </button>
        <span className="text-sm text-charcoal">{view === 'month' ? from.slice(0, 7) : `Week of ${from}`}</span>
        <button type="button" onClick={() => step(1)} className={secondary} aria-label="Next">
          ›
        </button>
        <button type="button" onClick={() => setView(view === 'month' ? 'week' : 'month')} className={secondary}>
          {view === 'month' ? 'Week view' : 'Month view'}
        </button>
        {canTeam && (
          <label className="flex items-center gap-2 text-sm text-charcoal">
            <input type="checkbox" checked={team} onChange={(e) => setTeam(e.target.checked)} /> Team
          </label>
        )}
      </div>
      {feed.data && <p className="text-xs text-charcoal-soft">Times are in {feed.data.timezone}.</p>}
      {feed.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {message(feed.error)}
        </p>
      )}

      <div className={view === 'month' ? 'grid grid-cols-7 gap-1' : 'space-y-1'}>
        {view === 'month' &&
          ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="text-center text-xs text-charcoal-soft">
              {d}
            </div>
          ))}
        {Array.from({ length: lead }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((d) => (
          <div key={d} className="min-h-16 rounded-xl border border-charcoal/10 bg-white p-1.5">
            <p className="text-xs text-charcoal-soft">{view === 'month' ? Number(d.slice(8)) : d}</p>
            <ul className="space-y-0.5">
              {(byDay.get(d) ?? []).map((item, i) => (
                <li key={`${item.kind}-${item.refId}-${i}`}>
                  <button
                    type="button"
                    disabled={item.kind !== 'meeting'}
                    onClick={() => item.refId && setOpen(item.refId)}
                    className={`block w-full truncate rounded px-1 text-left text-xs ${KIND_CLASS[item.kind]}`}
                    title={label(item)}
                  >
                    {label(item)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {canMeet && (
        <NewMeeting onDone={() => void queryClient.invalidateQueries({ queryKey: ['hrms', 'calendar'] })} />
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
