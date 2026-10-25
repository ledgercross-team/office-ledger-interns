'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  Banner,
  Button,
  Dialog,
  ErrorState,
  Input,
  PageHeader,
  PageShell,
  Radio,
  SegmentedControl,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import { StepperField } from '@/components/hrms/stepper-field';
import { MemberChips, MemberSearch, type MemberOption } from '@/components/hrms/member-search';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { meetingProblem } from '@/lib/hrms/meeting';
import { to12Hour } from '@/lib/hrms/time';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { CalendarFeed, CalendarItem, HrmsMeeting } from '@/lib/hrms/types';

const KIND_CLASS: Record<CalendarItem['kind'], string> = {
  task_due: 'bg-warning-soft text-warning-fg',
  meeting: 'bg-success-soft text-success-fg',
  leave: 'bg-info-soft text-info-fg',
  holiday: 'bg-surface-sunken text-fg-muted',
};

const WEEKDAYS = [
  { iso: 1, label: 'Mon' },
  { iso: 2, label: 'Tue' },
  { iso: 3, label: 'Wed' },
  { iso: 4, label: 'Thu' },
  { iso: 5, label: 'Fri' },
  { iso: 6, label: 'Sat' },
  { iso: 7, label: 'Sun' },
] as const;

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoDay(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
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
        {meeting.isLoading && <Skeleton className="h-48 w-full" />}
        {meeting.error && (
          <ErrorState
            title="Could not load meeting details"
            message={message(meeting.error)}
            onRetry={() => void meeting.refetch()}
          />
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
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
    setError(null);
    setFieldErrors({});
    if (problem) {
      setFieldErrors({ [problem.field]: [problem.message] });
      return;
    }
    // Typed in the browser's zone, sent as an exact instant.
    const at = (k: string) => new Date(String(f.get(k))).toISOString();
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
      if (err instanceof HrmsApiError) {
        const serverErrors = err.fieldErrors ?? {};
        setFieldErrors({
          title: serverErrors.title ?? [],
          start: serverErrors.startsAt ?? [],
          end: serverErrors.endsAt ?? [],
          description: serverErrors.description ?? [],
          place: serverErrors.meetingLink ?? serverErrors.location ?? [],
          invite: serverErrors.inviteeIds ?? [],
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full min-w-0 space-y-5 rounded-card border border-border bg-surface p-5 sm:p-6 lg:p-7"
    >
      <div>
        <h2 className="text-lg font-semibold text-fg">New meeting</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Schedule a meeting and invite the people who need to attend.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <Input
            id="meeting-title"
            name="title"
            required
            maxLength={200}
            placeholder="Title"
            label="Title"
            error={fieldErrors.title?.[0]}
            onChange={() => setFieldErrors((current) => ({ ...current, title: [] }))}
          />
        </div>
        <Input
          id="meeting-start"
          name="start"
          type="datetime-local"
          required
          label="Starts"
          error={fieldErrors.start?.[0]}
          onChange={() => setFieldErrors((current) => ({ ...current, start: [] }))}
        />
        <Input
          id="meeting-end"
          name="end"
          type="datetime-local"
          required
          label="Ends"
          error={fieldErrors.end?.[0]}
          onChange={() => setFieldErrors((current) => ({ ...current, end: [] }))}
        />
        <Radio
          label="Meeting format"
          value={where === 'link' ? 'online' : 'in-person'}
          onValueChange={(value) => setWhere(value === 'online' ? 'link' : 'location')}
          options={[
            { value: 'online', label: 'Online' },
            { value: 'in-person', label: 'In person' },
          ]}
        />
        <Input
          id="meeting-place"
          name="place"
          required
          type="text"
          placeholder={where === 'link' ? 'https://…' : 'Room or address'}
          label={where === 'link' ? 'Meeting link' : 'Room or address'}
          error={fieldErrors.place?.[0]}
          onChange={() => setFieldErrors((current) => ({ ...current, place: [] }))}
        />
        <div className="lg:col-span-2">
          <Textarea
            id="meeting-description"
            name="description"
            rows={2}
            maxLength={5000}
            placeholder="Notes"
            label="Notes (optional)"
            error={fieldErrors.description?.[0]}
            onChange={() => setFieldErrors((current) => ({ ...current, description: [] }))}
          />
        </div>
        <fieldset className="space-y-2 lg:col-span-2">
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
          {fieldErrors.invite?.[0] && (
            <p role="alert" className="text-xs text-danger-fg">
              {fieldErrors.invite[0]}
            </p>
          )}
        </fieldset>
      </div>
      {error && (
        <Banner tone="danger" title="Could not create meeting">
          {error}
        </Banner>
      )}
      <Button type="submit" loading={pending} disabled={invitees.length === 0}>
        Create meeting
      </Button>
    </form>
  );
}

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
  const weekendDays = feed.data?.weekendDays ?? [5, 6];

  // The calendar runs from the month the organisation was created to two years ahead.
  const today = new Date().toISOString().slice(0, 10);
  const minMonth = feed.data?.orgCreatedOn?.slice(0, 7) ?? null;
  const maxMonth = `${Number(today.slice(0, 4)) + 2}-${today.slice(5, 7)}`;
  const minDate = minMonth ? `${minMonth}-01` : null;
  const maxDate = addDays(`${maxMonth}-01`, 31).slice(0, 7) + '-01'; // first day after the last month
  const monthOf = from.slice(0, 7);
  const shiftMonth = (ym: string, n: number) => {
    const total = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  };
  const clampMonth = (ym: string) =>
    minMonth && ym < minMonth ? minMonth : ym > maxMonth ? maxMonth : ym;
  const goTo = (ym: string) => setAnchor(`${clampMonth(ym)}-01`);
  const canDown = !minMonth || monthOf > minMonth;
  const canUp = monthOf < maxMonth;
  const canWeekDown = !minDate || addDays(from, -7) >= minDate;
  const canWeekUp = addDays(from, 7) < maxDate;
  const monthLabel = (ym: string) =>
    `${MONTHS[Number(ym.slice(5, 7)) - 1].slice(0, 3)} ${ym.slice(0, 4)}`;
  const weekLabel = new Date(`${from}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  return (
    <PageShell className="w-full min-w-0">
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
          <StepperField
            label="Month"
            text={MONTHS[Number(monthOf.slice(5, 7)) - 1]}
            valueNow={Number(monthOf.slice(5, 7))}
            className="w-44"
            canUp={canUp}
            canDown={canDown}
            onUp={() => goTo(shiftMonth(monthOf, 1))}
            onDown={() => goTo(shiftMonth(monthOf, -1))}
            onPageUp={() => canUp && goTo(shiftMonth(monthOf, 12))}
            onPageDown={() => canDown && goTo(shiftMonth(monthOf, -12))}
          />
          <StepperField
            label="Year"
            text={monthOf.slice(0, 4)}
            valueNow={Number(monthOf.slice(0, 4))}
            className="w-28"
            canUp={canUp}
            canDown={canDown}
            onUp={() => goTo(shiftMonth(monthOf, 12))}
            onDown={() => goTo(shiftMonth(monthOf, -12))}
            onPageUp={() => canUp && goTo(shiftMonth(monthOf, 12))}
            onPageDown={() => canDown && goTo(shiftMonth(monthOf, -12))}
            onCommit={(typed) => {
              const year = Number.parseInt(typed, 10);
              if (Number.isFinite(year)) goTo(`${year}-${monthOf.slice(5, 7)}`);
            }}
          />
          {view === 'week' && (
            <StepperField
              label="Week"
              text={weekLabel}
              className="w-32"
              canUp={canWeekUp}
              canDown={canWeekDown}
              onUp={() => setAnchor(addDays(anchor, 7))}
              onDown={() => setAnchor(addDays(anchor, -7))}
            />
          )}
          <Button variant="secondary" onClick={() => setAnchor(today)}>
            <CalendarDays aria-hidden className="size-4" />
            Today
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Calendar view"
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
            ]}
            value={view}
            onValueChange={(next) => setView(next === 'week' ? 'week' : 'month')}
          />
          {canTeam && (
            <label className="flex min-h-10 items-center gap-2 rounded-control border border-border px-3 text-sm font-medium text-fg">
              <input type="checkbox" checked={team} onChange={(e) => setTeam(e.target.checked)} />
              Team
            </label>
          )}
        </div>
      </div>
      {feed.data && (
        <p className="text-sm text-fg-muted">
          Times are in {feed.data.timezone}.
          {minMonth && ` You can browse from ${monthLabel(minMonth)} to ${monthLabel(maxMonth)}.`}
        </p>
      )}
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

      {feed.data &&
        (view === 'month' ? (
          <>
            <div className="hidden sm:grid sm:grid-cols-7 sm:gap-1">
              {WEEKDAYS.map(({ iso, label: weekday }) => {
                const weekend = weekendDays.includes(iso);
                return (
                  <div
                    key={weekday}
                    className={`rounded-control px-1 py-1 text-center text-xs font-medium ${weekend ? 'bg-surface-sunken text-fg' : 'text-fg-muted'}`}
                  >
                    {weekday}
                    {weekend && (
                      <span className="ml-1 text-[10px] font-normal text-fg-muted">Off</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="hidden sm:grid sm:grid-cols-7 sm:gap-1">
              {Array.from({ length: lead }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {days.map((d) => {
                const weekend = weekendDays.includes(isoDay(d));
                return (
                  <div
                    key={d}
                    className={`min-h-24 rounded-control border border-border p-2 lg:min-h-28 ${weekend ? 'bg-surface-sunken' : 'bg-surface'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium tabular-nums text-fg-muted">
                        {Number(d.slice(8))}
                      </p>
                      {weekend && (
                        <span className="text-[10px] font-medium text-fg-muted">Weekend</span>
                      )}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {(byDay.get(d) ?? []).map((item, i) => (
                        <li key={`${item.kind}-${item.refId}-${i}`}>
                          <EventButton item={item} onOpen={setOpen} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <div className="space-y-2 sm:hidden">
              {days.map((d) => {
                const weekend = weekendDays.includes(isoDay(d));
                return (
                  <div
                    key={d}
                    className={`flex min-w-0 gap-3 rounded-card border border-border p-3 ${weekend ? 'bg-surface-sunken' : 'bg-surface'}`}
                  >
                    <div className="w-20 shrink-0 border-r border-border pr-3">
                      <p className="text-xs font-medium text-fg-muted">
                        {dayLabel(d).split(',')[0]}
                      </p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-fg">
                        {Number(d.slice(8))}
                      </p>
                      {weekend && (
                        <p className="mt-1 text-[10px] font-medium text-fg-muted">Weekend</p>
                      )}
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
                );
              })}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {days.map((d) => {
              const weekend = weekendDays.includes(isoDay(d));
              return (
                <div
                  key={d}
                  className={`flex min-w-0 gap-3 rounded-card border border-border p-3 sm:p-4 ${weekend ? 'bg-surface-sunken' : 'bg-surface'}`}
                >
                  <div className="w-28 shrink-0 border-r border-border pr-3 sm:w-36">
                    <p className="text-sm font-semibold text-fg">{dayLabel(d)}</p>
                    {weekend && <p className="mt-1 text-xs font-medium text-fg-muted">Weekend</p>}
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
              );
            })}
          </div>
        ))}

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
