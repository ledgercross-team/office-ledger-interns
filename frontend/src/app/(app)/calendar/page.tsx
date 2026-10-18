'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  Banner,
  Button,
  Dialog,
  ErrorState,
  PageHeader,
  PageShell,
  Skeleton,
  useToast,
} from '@/components/ui';
import { MemberChips, MemberSearch, type MemberOption } from '@/components/hrms/member-search';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { meetingProblem } from '@/lib/hrms/meeting';
import { to12Hour } from '@/lib/hrms/time';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { CalendarFeed, CalendarItem, HrmsMeeting } from '@/lib/hrms/types';

const input =
  'min-h-10 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-4 focus:ring-primary/10';
const primary =
  'inline-flex min-h-10 items-center justify-center rounded-full border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50';
const secondary =
  'inline-flex min-h-10 items-center justify-center rounded-full border border-border bg-surface px-3 py-2 text-sm font-medium text-fg hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50';

const KIND_CLASS: Record<CalendarItem['kind'], string> = {
  task_due: 'bg-warning-soft text-warning-fg',
  meeting: 'bg-success-soft text-success-fg',
  leave: 'bg-info-soft text-info-fg',
  holiday: 'bg-surface-sunken text-fg-muted',
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

function dayLabel(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}

function EventButton({
  item,
  compact = false,
  onOpen,
}: {
  item: CalendarItem;
  compact?: boolean;
  onOpen: (id: string) => void;
}) {
  const text =
    compact && item.kind !== 'meeting'
      ? item.kind === 'task_due'
        ? 'Task due'
        : item.kind === 'holiday'
          ? 'Holiday'
          : 'Leave'
      : label(item);
  return (
    <button
      type="button"
      disabled={item.kind !== 'meeting'}
      onClick={() => item.refId && onOpen(item.refId)}
      aria-label={label(item)}
      className={`block min-h-7 w-full rounded-control px-1.5 py-1 text-left text-xs ${KIND_CLASS[item.kind]} ${compact ? 'line-clamp-2' : 'truncate'}`}
      title={label(item)}
    >
      {text}
    </button>
  );
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={m?.title ?? 'Meeting details'}
      description="Review the meeting details and invitee responses."
    >
      <div className="space-y-3">
        {!m && (
          <p className="text-sm text-fg-muted" role="status">
            Loading meeting details…
          </p>
        )}
        {m && (
          <>
            <p className="text-sm text-fg">
              {m.startsAtLocal.slice(0, 10)} {to12Hour(m.startsAtLocal)} to{' '}
              {to12Hour(m.endsAtLocal)} ({m.timezone})
            </p>
            <p className="text-sm text-fg">
              {m.meetingLink ? (
                <a
                  href={m.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Join the meeting
                </a>
              ) : (
                m.location
              )}
            </p>
            {m.description && <p className="text-sm text-fg">{m.description}</p>}
            <p className="text-xs text-fg-muted">Organised by {m.createdBy.fullName}</p>
            <ul className="space-y-1 text-sm text-fg">
              {m.invitees.map((i) => (
                <li key={i.memberId}>
                  {i.fullName} <span className="text-xs text-fg-muted">{i.response}</span>
                </li>
              ))}
            </ul>
            {m.cancelled && <p className="text-sm text-danger-fg">This meeting is cancelled.</p>}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {mine && !m.cancelled && (
                <>
                  <Button
                    type="button"
                    loading={respond.isPending}
                    onClick={() => respond.mutate('accepted')}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={respond.isPending}
                    onClick={() => respond.mutate('declined')}
                  >
                    Decline
                  </Button>
                </>
              )}
              {m.canEdit && (
                <Button
                  type="button"
                  variant="secondary"
                  loading={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  Cancel meeting
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
        {error && (
          <Banner tone="danger" title="Meeting action failed">
            {error}
          </Banner>
        )}
      </div>
    </Dialog>
  );
}

function NewMeeting({ onDone }: { onDone: () => void }) {
  const [where, setWhere] = useState<'link' | 'location'>('link');
  const [chosen, setChosen] = useState<MemberOption[]>([]);
  const invitees = chosen.map((m) => m.id);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { session } = useHrmsAuth();
  const toast = useToast();

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
      toast({
        title: 'Meeting created',
        description: 'Invitees have been notified.',
        tone: 'success',
      });
    } catch (err) {
      setError(message(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-2xl space-y-4 rounded-card border border-border bg-surface p-5"
    >
      <div>
        <h2 className="text-lg font-semibold text-fg">New meeting</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Schedule a meeting and invite the people who need to attend.
        </p>
      </div>
      <label htmlFor="meeting-title" className="block space-y-1.5 text-sm font-medium text-fg">
        Title
        <input
          id="meeting-title"
          name="title"
          required
          maxLength={200}
          placeholder="Title"
          className={input}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor="meeting-start" className="block space-y-1.5 text-sm font-medium text-fg">
          Starts
          <input id="meeting-start" name="start" type="datetime-local" required className={input} />
        </label>
        <label htmlFor="meeting-end" className="block space-y-1.5 text-sm font-medium text-fg">
          Ends
          <input id="meeting-end" name="end" type="datetime-local" required className={input} />
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-fg">
        <legend className="sr-only">Meeting format</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="meeting-format"
            value="online"
            checked={where === 'link'}
            onChange={() => setWhere('link')}
          />{' '}
          Online
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="meeting-format"
            value="in-person"
            checked={where === 'location'}
            onChange={() => setWhere('location')}
          />{' '}
          In person
        </label>
      </fieldset>
      <label htmlFor="meeting-place" className="block space-y-1.5 text-sm font-medium text-fg">
        {where === 'link' ? 'Meeting link' : 'Room or address'}
        <input
          id="meeting-place"
          name="place"
          required
          type={where === 'link' ? 'url' : 'text'}
          placeholder={where === 'link' ? 'https://…' : 'Room or address'}
          className={input}
        />
      </label>
      <label
        htmlFor="meeting-description"
        className="block space-y-1.5 text-sm font-medium text-fg"
      >
        Notes <span className="text-fg-muted">(optional)</span>
        <textarea
          id="meeting-description"
          name="description"
          rows={2}
          placeholder="Notes"
          className={input}
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-fg">Invite</legend>
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
        <Banner tone="danger" title="Could not create meeting">
          {error}
        </Banner>
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
    <PageShell>
      <PageHeader
        title={canTeam ? 'Team calendar' : 'My calendar'}
        description={
          canTeam
            ? 'See work deadlines, leave, holidays, and meetings for the team.'
            : 'See your work deadlines, leave, holidays, and meetings.'
        }
      />
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1">
            <button
              type="button"
              onClick={() => step(-1)}
              className={secondary}
              aria-label="Previous period"
            >
              <span aria-hidden>‹</span>
            </button>
            <span
              aria-live="polite"
              className="min-w-28 px-2 text-center text-sm font-medium tabular-nums text-fg"
            >
              {view === 'month' ? from.slice(0, 7) : `Week of ${from}`}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              className={secondary}
              aria-label="Next period"
            >
              <span aria-hidden>›</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setView(view === 'month' ? 'week' : 'month')}
            className={secondary}
          >
            {view === 'month' ? 'Week view' : 'Month view'}
          </button>
          {canTeam && (
            <label className="flex min-h-10 items-center gap-2 rounded-full border border-border px-3 text-sm font-medium text-fg">
              <input type="checkbox" checked={team} onChange={(e) => setTeam(e.target.checked)} />
              Team
            </label>
          )}
        </div>
      </div>
      {feed.data && <p className="text-sm text-fg-muted">Times are in {feed.data.timezone}.</p>}
      {feed.error && (
        <ErrorState
          title="Could not load calendar"
          message={message(feed.error)}
          onRetry={() => void feed.refetch()}
        />
      )}

      {feed.isLoading && (
        <div className="grid gap-2 sm:grid-cols-7" aria-label="Loading calendar">
          {Array.from({ length: 14 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      )}

      {view === 'month' ? (
        <>
          <div className="hidden sm:grid sm:grid-cols-7 sm:gap-1">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="px-1 text-center text-xs font-medium text-fg-muted">
                {d}
              </div>
            ))}
          </div>
          <div className="hidden sm:grid sm:grid-cols-7 sm:gap-1">
            {Array.from({ length: lead }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {days.map((d) => (
              <div
                key={d}
                className="min-h-24 rounded-control border border-border bg-surface p-2 lg:min-h-28"
              >
                <p className="text-xs font-medium tabular-nums text-fg-muted">
                  {Number(d.slice(8))}
                </p>
                <ul className="mt-1 space-y-1">
                  {(byDay.get(d) ?? []).map((item, i) => (
                    <li key={`${item.kind}-${item.refId}-${i}`}>
                      <EventButton item={item} onOpen={setOpen} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="space-y-2 sm:hidden">
            {days.map((d) => (
              <div
                key={d}
                className="flex min-w-0 gap-3 rounded-card border border-border bg-surface p-3"
              >
                <div className="w-16 shrink-0 border-r border-border pr-3">
                  <p className="text-xs font-medium text-fg-muted">{dayLabel(d).split(',')[0]}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-fg">
                    {Number(d.slice(8))}
                  </p>
                </div>
                <ul className="min-w-0 flex-1 space-y-1">
                  {(byDay.get(d) ?? []).length > 0 ? (
                    (byDay.get(d) ?? []).map((item, i) => (
                      <li key={`${item.kind}-${item.refId}-${i}`}>
                        <EventButton item={item} compact onOpen={setOpen} />
                      </li>
                    ))
                  ) : (
                    <li className="py-1 text-sm text-fg-muted">No events</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {days.map((d) => (
            <div
              key={d}
              className="flex min-w-0 gap-3 rounded-card border border-border bg-surface p-3 sm:p-4"
            >
              <div className="w-24 shrink-0 border-r border-border pr-3 sm:w-32">
                <p className="text-sm font-semibold text-fg">{dayLabel(d)}</p>
              </div>
              <ul className="min-w-0 flex-1 space-y-1">
                {(byDay.get(d) ?? []).length > 0 ? (
                  (byDay.get(d) ?? []).map((item, i) => (
                    <li key={`${item.kind}-${item.refId}-${i}`}>
                      <EventButton item={item} onOpen={setOpen} />
                    </li>
                  ))
                ) : (
                  <li className="py-1 text-sm text-fg-muted">No events</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

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
    </PageShell>
  );
}
