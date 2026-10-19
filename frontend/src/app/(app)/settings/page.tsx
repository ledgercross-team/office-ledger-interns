'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/hrms/role-gate';
import { SeatBar } from '@/components/hrms/seat-bar';
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  PageShell,
  Skeleton,
  TimezoneSelect,
} from '@/components/ui';
import { MemberSearch, type MemberOption } from '@/components/hrms/member-search';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { Holiday, HrmsOrg, LeaveType, OfficeNetwork, OrgSettings } from '@/lib/hrms/types';

const DAYS = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [7, 'Sun'],
] as const;

const input =
  'min-h-10 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none transition-[border-color,box-shadow,background-color] duration-150 focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-subtle';
const card = 'space-y-4 rounded-card border border-border bg-surface p-5 text-fg';
const inlineButton =
  'inline-flex min-h-10 items-center justify-center rounded-full border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50';

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

function Num({
  name,
  label,
  value,
  disabled,
  step,
  min,
  max,
}: {
  name: string;
  label: string;
  value: number;
  disabled: boolean;
  step?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label htmlFor={`org-${name}`} className="block space-y-1.5 text-sm font-medium text-fg">
      {label}
      <input
        id={`org-${name}`}
        name={name}
        type="number"
        step={step ?? '1'}
        min={min}
        max={max}
        defaultValue={value}
        disabled={disabled}
        className={input}
      />
    </label>
  );
}

function SettingsForm({ settings, canEdit }: { settings: OrgSettings; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [weightTotal, setWeightTotal] = useState(
    settings.weightAttendance +
      settings.weightRating +
      settings.weightOntime +
      settings.weightLeave,
  );
  const [weightError, setWeightError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      hrmsFetch<OrgSettings>('/org/settings', { method: 'PATCH', body }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'org'] });
    },
    onError: (err) => {
      setSaved(false);
      setError(message(err));
    },
  });

  function readWeights(form: HTMLFormElement) {
    const values = ['weightAttendance', 'weightRating', 'weightOntime', 'weightLeave'].map((key) =>
      Number(new FormData(form).get(key) ?? 0),
    );
    return { values, total: values.reduce((sum, value) => sum + value, 0) };
  }

  function onChange(event: FormEvent<HTMLFormElement>) {
    const { values, total } = readWeights(event.currentTarget);
    setWeightTotal(total);
    setSaved(false);
    setWeightError(
      values.some((value) => value < 0)
        ? 'Weights cannot be negative.'
        : total === 100
          ? null
          : `Weights must add up to 100%. Current total: ${total}%.`,
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const n = (key: string) => Number(f.get(key));
    const weights = readWeights(event.currentTarget);
    if (weights.values.some((value) => value < 0) || weights.total !== 100) {
      setWeightTotal(weights.total);
      setWeightError(
        weights.values.some((value) => value < 0)
          ? 'Weights cannot be negative.'
          : `Weights must add up to 100%. Current total: ${weights.total}%.`,
      );
      return;
    }
    setSaved(false);
    setWeightError(null);
    save.mutate({
      timezone: String(f.get('timezone')),
      workStartTime: String(f.get('workStartTime')),
      lateGraceMinutes: n('lateGraceMinutes'),
      weekendDays: DAYS.filter(([d]) => f.get(`day${d}`) === 'on').map(([d]) => d),
      workloadAmberTasks: n('workloadAmberTasks'),
      workloadAmberProjects: n('workloadAmberProjects'),
      workloadRedTasks: n('workloadRedTasks'),
      workloadRedProjects: n('workloadRedProjects'),
      weightAttendance: n('weightAttendance'),
      weightRating: n('weightRating'),
      weightOntime: n('weightOntime'),
      weightLeave: n('weightLeave'),
    });
  }

  const disabled = !canEdit;
  return (
    <form onSubmit={onSubmit} onChange={onChange} className={`${card} w-full`}>
      <div>
        <h2 className="text-lg font-semibold text-fg">Working time</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Set the office clock used for attendance, late check-ins, and weekend calculations.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TimezoneSelect
            id="orgTimezone"
            name="timezone"
            label="Office time zone"
            helperText="Decides what counts as today and when someone is late. Set it to where your office is."
            defaultValue={settings.timezone}
            disabled={disabled}
          />
        </div>
        <label htmlFor="work-start-time" className="block space-y-1.5 text-sm font-medium text-fg">
          Work starts
          <input
            id="work-start-time"
            name="workStartTime"
            type="time"
            defaultValue={settings.workStartTime}
            disabled={disabled}
            className={input}
          />
        </label>
        <Num
          name="lateGraceMinutes"
          label="Late after (minutes)"
          value={settings.lateGraceMinutes}
          disabled={disabled}
        />
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-fg">Weekend days</legend>
        <div className="flex flex-wrap gap-3">
          {DAYS.map(([d, label]) => (
            <label key={d} className="flex items-center gap-1 text-sm text-fg">
              <input
                type="checkbox"
                name={`day${d}`}
                defaultChecked={settings.weekendDays.includes(d)}
                disabled={disabled}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="border-t border-border pt-5">
        <h2 className="text-lg font-semibold text-fg">Workload colours</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Thresholds control when the workload badges change from healthy to busy or overloaded.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Num
          name="workloadAmberTasks"
          label="Amber: open tasks from"
          value={settings.workloadAmberTasks}
          disabled={disabled}
        />
        <Num
          name="workloadAmberProjects"
          label="Amber: projects from"
          value={settings.workloadAmberProjects}
          disabled={disabled}
        />
        <Num
          name="workloadRedTasks"
          label="Red: open tasks from"
          value={settings.workloadRedTasks}
          disabled={disabled}
        />
        <Num
          name="workloadRedProjects"
          label="Red: projects from"
          value={settings.workloadRedProjects}
          disabled={disabled}
        />
      </div>

      <div className="border-t border-border pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">Performance score weights</h2>
            <p className="mt-1 max-w-2xl text-sm text-fg-muted">
              These weights are used by the nightly score calculation. They must total exactly 100%.
            </p>
          </div>
          <span
            role="status"
            aria-live="polite"
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              weightTotal === 100
                ? 'border-success/30 bg-success-soft text-success-fg'
                : 'border-danger/30 bg-danger-soft text-danger-fg'
            }`}
          >
            {weightTotal}% total
          </span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Num
          name="weightAttendance"
          label="Attendance"
          value={settings.weightAttendance}
          disabled={disabled}
          min={0}
          max={100}
        />
        <Num
          name="weightRating"
          label="Ratings"
          value={settings.weightRating}
          disabled={disabled}
          min={0}
          max={100}
        />
        <Num
          name="weightOntime"
          label="Tasks done on time"
          value={settings.weightOntime}
          disabled={disabled}
          min={0}
          max={100}
        />
        <Num
          name="weightLeave"
          label="Leave requests"
          value={settings.weightLeave}
          disabled={disabled}
          min={0}
          max={100}
        />
      </div>

      {weightError && (
        <Banner tone="warning" title="Weight total must be 100%">
          {weightError}
        </Banner>
      )}

      {error && (
        <Banner tone="danger" title="Could not save settings">
          {error}
        </Banner>
      )}
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            loading={save.isPending}
            disabled={weightTotal !== 100 || weightError !== null}
            loadingLabel="Saving"
          >
            Save settings
          </Button>
          {saved && (
            <span role="status" className="text-sm font-medium text-success-fg">
              Saved
            </span>
          )}
        </div>
      )}
    </form>
  );
}

function NetworksCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const key = ['hrms', 'org', 'networks'];
  const list = useQuery({
    queryKey: key,
    queryFn: () => hrmsFetch<{ items: OfficeNetwork[] }>('/org/office-networks'),
  });
  const done = () => queryClient.invalidateQueries({ queryKey: key });
  const add = useMutation({
    mutationFn: (body: { network: string; label?: string }) =>
      hrmsFetch('/org/office-networks', { method: 'POST', body }),
    onSuccess: () => {
      setError(null);
      void done();
    },
    onError: (err) => setError(message(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => hrmsFetch(`/org/office-networks/${id}`, { method: 'DELETE' }),
    onSuccess: () => void done(),
    onError: (err) => setError(message(err)),
  });

  return (
    <section className={`${card} flex h-full w-full min-w-0 flex-col`}>
      <div>
        <h2 className="text-lg font-semibold text-fg">Office IP addresses</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Check-in is accepted only from these addresses. Add at least one before anyone can check
          in.
        </p>
      </div>
      <ul className="space-y-1 text-sm">
        {list.data?.items.map((n) => (
          <li key={n.id} className="flex items-center justify-between gap-2">
            <span>
              <span className="font-mono">{n.network}</span>
              {n.label && <span className="ml-2 text-fg-muted">{n.label}</span>}
            </span>
            {canEdit && (
              <ConfirmDialog
                trigger={
                  <button type="button" className="text-sm text-danger-fg hover:underline">
                    Remove
                  </button>
                }
                title={`Remove ${n.network}?`}
                description="People will no longer be able to check in from this address."
                confirmLabel="Remove address"
                loading={remove.isPending}
                onConfirm={() => remove.mutate(n.id)}
              />
            )}
          </li>
        ))}
        {list.data?.items.length === 0 && (
          <li className="text-sm text-fg-muted">None set: check-in is currently disabled.</li>
        )}
      </ul>
      {canEdit && (
        <form
          className="mt-auto flex flex-wrap items-center gap-2 pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            add.mutate({
              network: String(f.get('network')).trim(),
              label: String(f.get('label')).trim() || undefined,
            });
            event.currentTarget.reset();
          }}
        >
          <input
            id="office-network"
            name="network"
            required
            placeholder="203.0.113.0/24"
            aria-label="Office IP address or network"
            className={`${input} max-w-48`}
          />
          <label htmlFor="office-network-label" className="sr-only">
            Network label (optional)
          </label>
          <input
            id="office-network-label"
            name="label"
            placeholder="Label (optional)"
            className={`${input} max-w-48`}
          />
          <button type="submit" className={inlineButton}>
            Add
          </button>
        </form>
      )}
      {error && (
        <Banner tone="danger" title="Could not update office networks">
          {error}
        </Banner>
      )}
    </section>
  );
}

function HolidaysCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const key = ['hrms', 'org', 'holidays'];
  const list = useQuery({
    queryKey: key,
    queryFn: () => hrmsFetch<{ items: Holiday[] }>('/org/holidays'),
  });
  const done = () => queryClient.invalidateQueries({ queryKey: key });
  const add = useMutation({
    mutationFn: (body: Holiday) => hrmsFetch('/org/holidays', { method: 'POST', body }),
    onSuccess: () => {
      setError(null);
      void done();
    },
    onError: (err) => setError(message(err)),
  });
  const remove = useMutation({
    mutationFn: (date: string) => hrmsFetch(`/org/holidays/${date}`, { method: 'DELETE' }),
    onSuccess: () => void done(),
    onError: (err) => setError(message(err)),
  });

  return (
    <section className={`${card} flex h-full min-w-0 flex-col`}>
      <div>
        <h2 className="text-lg font-semibold text-fg">Holidays</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Dates excluded from working-day attendance calculations.
        </p>
      </div>
      <ul className="space-y-1 text-sm">
        {list.data?.items.map((h) => (
          <li key={h.date} className="flex items-center justify-between gap-2">
            <span>
              {h.date} <span className="ml-2 text-fg-muted">{h.name}</span>
            </span>
            {canEdit && (
              <ConfirmDialog
                trigger={
                  <button type="button" className="text-sm text-danger-fg hover:underline">
                    Remove
                  </button>
                }
                title={`Remove ${h.name}?`}
                description={`The ${h.date} holiday will no longer be excluded from attendance calculations.`}
                confirmLabel="Remove holiday"
                loading={remove.isPending}
                onConfirm={() => remove.mutate(h.date)}
              />
            )}
          </li>
        ))}
        {list.data?.items.length === 0 && (
          <li>
            <EmptyState
              title="No holidays yet"
              description="Add a holiday to exclude it from attendance calculations."
            />
          </li>
        )}
      </ul>
      {canEdit && (
        <form
          className="mt-auto flex flex-wrap items-center gap-2 pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            add.mutate({ date: String(f.get('date')), name: String(f.get('name')).trim() });
            event.currentTarget.reset();
          }}
        >
          <label htmlFor="holiday-date" className="sr-only">
            Holiday date
          </label>
          <input
            id="holiday-date"
            name="date"
            type="date"
            required
            className={`${input} max-w-48`}
          />
          <label htmlFor="holiday-name" className="sr-only">
            Holiday name
          </label>
          <input
            id="holiday-name"
            name="name"
            required
            placeholder="Name"
            className={`${input} max-w-48`}
          />
          <button type="submit" className={inlineButton}>
            Add
          </button>
        </form>
      )}
      {error && (
        <Banner tone="danger" title="Could not update holidays">
          {error}
        </Banner>
      )}
    </section>
  );
}

function LeaveTypesCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const key = ['hrms', 'org', 'leave-types'];
  const list = useQuery({
    queryKey: key,
    queryFn: () => hrmsFetch<{ items: LeaveType[] }>('/org/leave-types'),
  });
  const done = () => queryClient.invalidateQueries({ queryKey: key });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      hrmsFetch('/org/leave-types', { method: 'POST', body }),
    onSuccess: () => {
      setError(null);
      void done();
    },
    onError: (err) => setError(message(err)),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      hrmsFetch(`/org/leave-types/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setError(null);
      void done();
    },
    onError: (err) => setError(message(err)),
  });

  return (
    <section className={`${card} flex h-full min-w-0 flex-col`}>
      <div>
        <h2 className="text-lg font-semibold text-fg">Leave types and yearly allowances</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Maintain the leave options and yearly allowance available to people.
        </p>
      </div>
      <ul className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
        {list.data?.items.map((t) => (
          <li
            key={t.id}
            className="flex min-w-0 flex-wrap items-center gap-3 rounded-control bg-surface-sunken px-3 py-2"
          >
            <span
              className={`min-w-24 flex-1 font-medium ${t.isActive ? '' : 'text-fg-muted line-through'}`}
            >
              {t.name}
            </span>
            <span className="text-fg-muted">{t.isPaid ? 'paid' : 'unpaid'}</span>
            <label className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                step="0.5"
                defaultValue={t.yearlyAllowanceDays}
                disabled={!canEdit}
                aria-label={`${t.name} yearly allowance`}
                className={`${input} w-24`}
                onBlur={(event) => {
                  const value = Number(event.target.value);
                  if (canEdit && value !== t.yearlyAllowanceDays) {
                    patch.mutate({ id: t.id, body: { yearlyAllowanceDays: value } });
                  }
                }}
              />
              days
            </label>
            {canEdit &&
              (t.isActive ? (
                <ConfirmDialog
                  trigger={
                    <button type="button" className="text-sm text-primary hover:underline">
                      Disable
                    </button>
                  }
                  title={`Disable ${t.name}?`}
                  description="Existing leave records stay unchanged, but this leave type will no longer be available for new requests."
                  confirmLabel="Disable leave type"
                  loading={patch.isPending}
                  onConfirm={() => patch.mutate({ id: t.id, body: { isActive: false } })}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => patch.mutate({ id: t.id, body: { isActive: true } })}
                  className="text-sm text-primary hover:underline"
                  disabled={patch.isPending}
                >
                  Enable
                </button>
              ))}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form
          className="mt-auto grid w-full gap-3 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_8rem_auto_auto] xl:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            create.mutate({
              code: String(f.get('code')).trim(),
              name: String(f.get('name')).trim(),
              yearlyAllowanceDays: Number(f.get('days')),
              isPaid: f.get('paid') === 'on',
            });
            event.currentTarget.reset();
          }}
        >
          <label htmlFor="leave-type-code" className="sr-only">
            Leave type code
          </label>
          <input
            id="leave-type-code"
            name="code"
            required
            placeholder="code (e.g. study)"
            className={`${input} max-w-none`}
          />
          <label htmlFor="leave-type-name" className="sr-only">
            Leave type name
          </label>
          <input
            id="leave-type-name"
            name="name"
            required
            placeholder="Name"
            className={`${input} max-w-none`}
          />
          <input
            id="leave-type-days"
            name="days"
            type="number"
            min={0}
            step="0.5"
            required
            placeholder="Days"
            aria-label="Yearly allowance in days"
            className={`${input} w-full`}
          />
          <label className="flex min-h-10 items-center gap-1 text-sm">
            <input id="leave-type-paid" type="checkbox" name="paid" defaultChecked /> Paid
          </label>
          <button type="submit" className={inlineButton}>
            Add type
          </button>
        </form>
      )}
      {error && (
        <Banner tone="danger" title="Could not update leave types">
          {error}
        </Banner>
      )}
    </section>
  );
}

function RecoveryCard({ role }: { role: 'ceo' | 'coo' }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [person, setPerson] = useState<MemberOption | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setError(null);
    setDone(false);
    try {
      if (role === 'coo') {
        await hrmsFetch('/org/recovery-requests', {
          method: 'POST',
          body: {
            targetMemberId: String(f.get('member')),
            newEmail: String(f.get('email')).trim(),
          },
        });
      } else {
        await hrmsFetch('/org/last-ceo-removal', {
          method: 'POST',
          body: { replacementMemberId: String(f.get('member')) },
        });
      }
      setDone(true);
    } catch (err) {
      setError(message(err));
    }
  }

  return (
    <form onSubmit={onSubmit} className={`${card} flex h-full min-w-0 flex-col`}>
      <h2 className="text-lg font-semibold text-fg">
        {role === 'coo' ? "Recover a CEO's access" : 'Hand over as CEO'}
      </h2>
      <p className="text-sm text-fg-muted">
        {role === 'coo'
          ? 'The platform team checks the person offline, then sends a one-time link to the new address.'
          : 'Choose who takes over. The platform team verifies the request, then you are replaced.'}
      </p>
      <MemberSearch
        label="Person"
        name="member"
        required
        role={role === 'coo' ? 'ceo' : 'coo'}
        selected={person}
        onSelect={setPerson}
        onClear={() => setPerson(null)}
      />
      {role === 'coo' && (
        <label htmlFor="recovery-email" className="block space-y-1.5 text-sm font-medium text-fg">
          New verified email
          <input
            id="recovery-email"
            name="email"
            type="email"
            required
            placeholder="name@example.com"
            className={input}
          />
        </label>
      )}
      {error && (
        <Banner tone="danger" title="Could not send recovery request">
          {error}
        </Banner>
      )}
      {done && (
        <Banner tone="success" title="Recovery request sent">
          The platform team will review it.
        </Banner>
      )}
      <div className="mt-auto pt-2">
        <button type="submit" className={inlineButton}>
          Send request
        </button>
      </div>
    </form>
  );
}

function ExportCard() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function download() {
    setError(null);
    setPending(true);
    try {
      const data = await hrmsFetch<unknown>('/org/export', { method: 'POST' });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'organisation-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(message(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={`${card} flex h-full min-w-0 flex-col`}>
      <h2 className="text-lg font-semibold text-fg">Export all data</h2>
      <p className="text-sm text-fg-muted">
        Downloads everything the organisation holds. It stays available for 15 days after a
        suspension.
      </p>
      <div className="mt-auto pt-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void download()}
          className={inlineButton}
        >
          {pending ? 'Preparing…' : 'Download export'}
        </button>
      </div>
      {error && (
        <Banner tone="danger" title="Could not export data">
          {error}
        </Banner>
      )}
    </section>
  );
}

function SettingsContent() {
  const { session } = useHrmsAuth();
  const canEdit = session?.role === 'ceo';
  const canManageNetworks = session?.role === 'ceo' || session?.role === 'coo';
  const org = useQuery({
    queryKey: ['hrms', 'org', session?.activeMemberId],
    queryFn: () => hrmsFetch<HrmsOrg>('/org'),
  });

  return (
    <PageShell className="w-full min-w-0">
      <PageHeader
        title="Organisation settings"
        description="Keep working rules, check-in networks, leave policy, and account controls in one place."
      />

      {!canEdit && (
        <Banner tone="info" title="Limited settings access">
          CEO controls organisation-wide rules, leave policy, and exports. CEOs and COOs can manage
          office check-in networks.
        </Banner>
      )}

      {org.isLoading && (
        <div className="space-y-4" aria-label="Loading organisation settings">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
          <div className="grid gap-5 xl:grid-cols-2">
            <Skeleton className="h-52" />
            <Skeleton className="h-52" />
          </div>
        </div>
      )}

      {org.error && (
        <ErrorState
          title="Could not load organisation settings"
          message={(org.error as Error).message}
          onRetry={() => void org.refetch()}
        />
      )}

      {org.data && (
        <>
          {org.data.seats && (
            <Card className="space-y-3">
              <div>
                <h2 className="font-semibold text-fg">Plan and seats</h2>
                <p className="mt-1 text-sm text-fg-muted">
                  Current organisation capacity and usage.
                </p>
              </div>
              <SeatBar seats={org.data.seats} />
              <p className="text-sm text-fg-muted">Plan: {org.data.seats.planCode}</p>
            </Card>
          )}

          <SettingsForm
            key={JSON.stringify(org.data.settings)}
            settings={org.data.settings}
            canEdit={canEdit}
          />

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="min-w-0">
              <NetworksCard canEdit={canManageNetworks} />
            </div>
            <div className="min-w-0">
              <HolidaysCard canEdit={canEdit} />
            </div>
            <div className="w-full min-w-0 xl:col-span-2">
              <LeaveTypesCard canEdit={canEdit} />
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {(session?.role === 'ceo' || session?.role === 'coo') && (
              <div className="min-w-0">
                <RecoveryCard role={session.role} />
              </div>
            )}
            {session?.role === 'ceo' && (
              <div className="min-w-0">
                <ExportCard />
              </div>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}

export default function OrgSettingsPage() {
  return (
    <RoleGate allow={['ceo', 'coo']}>
      <SettingsContent />
    </RoleGate>
  );
}
