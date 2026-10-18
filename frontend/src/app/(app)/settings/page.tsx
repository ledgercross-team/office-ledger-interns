'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/hrms/role-gate';
import { SeatBar } from '@/components/hrms/seat-bar';
import { TimezoneSelect } from '@/components/ui';
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
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen disabled:bg-offwhite';
const card = 'space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4';
const button =
  'rounded-xl bg-evergreen px-4 py-2 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60';

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

function Num({
  name,
  label,
  value,
  disabled,
  step,
}: {
  name: string;
  label: string;
  value: number;
  disabled: boolean;
  step?: string;
}) {
  return (
    <label className="block space-y-1 text-sm text-charcoal">
      {label}
      <input
        name={name}
        type="number"
        step={step ?? '1'}
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

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const n = (key: string) => Number(f.get(key));
    setSaved(false);
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
    <form onSubmit={onSubmit} className={card}>
      <h2 className="font-medium text-charcoal">Working time</h2>
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
        <label className="block space-y-1 text-sm text-charcoal">
          Work starts
          <input
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
        <legend className="text-sm text-charcoal">Weekend days</legend>
        <div className="flex flex-wrap gap-3">
          {DAYS.map(([d, label]) => (
            <label key={d} className="flex items-center gap-1 text-sm text-charcoal">
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

      <h2 className="pt-2 font-medium text-charcoal">Workload colours</h2>
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

      <h2 className="pt-2 font-medium text-charcoal">
        Performance score weights (must add up to 100)
      </h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <Num
          name="weightAttendance"
          label="Attendance"
          value={settings.weightAttendance}
          disabled={disabled}
        />
        <Num
          name="weightRating"
          label="Ratings"
          value={settings.weightRating}
          disabled={disabled}
        />
        <Num
          name="weightOntime"
          label="On-time tasks"
          value={settings.weightOntime}
          disabled={disabled}
        />
        <Num name="weightLeave" label="Leave" value={settings.weightLeave} disabled={disabled} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
      {canEdit && (
        <div className="flex items-center gap-3">
          <button type="submit" disabled={save.isPending} className={button}>
            Save settings
          </button>
          {saved && (
            <span role="status" className="text-sm text-evergreen">
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
    <section className={card}>
      <h2 className="font-medium text-charcoal">Office IP addresses</h2>
      <p className="text-sm text-charcoal-soft">
        Check-in is accepted only from these addresses. Add at least one before anyone can check in.
      </p>
      <ul className="space-y-1 text-sm">
        {list.data?.items.map((n) => (
          <li key={n.id} className="flex items-center justify-between gap-2">
            <span>
              <span className="font-mono">{n.network}</span>
              {n.label && <span className="ml-2 text-charcoal-soft">{n.label}</span>}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => remove.mutate(n.id)}
                className="text-alert-deep hover:underline"
              >
                Remove
              </button>
            )}
          </li>
        ))}
        {list.data?.items.length === 0 && (
          <li className="text-charcoal-soft">None set: check-in is currently disabled.</li>
        )}
      </ul>
      {canEdit && (
        <form
          className="flex flex-wrap gap-2"
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
            name="network"
            required
            placeholder="203.0.113.0/24"
            className={`${input} max-w-48`}
          />
          <input name="label" placeholder="Label (optional)" className={`${input} max-w-48`} />
          <button type="submit" className={button}>
            Add
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
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
    <section className={card}>
      <h2 className="font-medium text-charcoal">Holidays</h2>
      <ul className="space-y-1 text-sm">
        {list.data?.items.map((h) => (
          <li key={h.date} className="flex items-center justify-between gap-2">
            <span>
              {h.date} <span className="ml-2 text-charcoal-soft">{h.name}</span>
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => remove.mutate(h.date)}
                className="text-alert-deep hover:underline"
              >
                Remove
              </button>
            )}
          </li>
        ))}
        {list.data?.items.length === 0 && <li className="text-charcoal-soft">None yet.</li>}
      </ul>
      {canEdit && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            add.mutate({ date: String(f.get('date')), name: String(f.get('name')).trim() });
            event.currentTarget.reset();
          }}
        >
          <input name="date" type="date" required className={`${input} max-w-48`} />
          <input name="name" required placeholder="Name" className={`${input} max-w-48`} />
          <button type="submit" className={button}>
            Add
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
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
    <section className={card}>
      <h2 className="font-medium text-charcoal">Leave types and yearly allowances</h2>
      <ul className="space-y-2 text-sm">
        {list.data?.items.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3">
            <span
              className={`min-w-24 font-medium ${t.isActive ? '' : 'text-charcoal-soft line-through'}`}
            >
              {t.name}
            </span>
            <span className="text-charcoal-soft">{t.isPaid ? 'paid' : 'unpaid'}</span>
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
            {canEdit && (
              <button
                type="button"
                onClick={() => patch.mutate({ id: t.id, body: { isActive: !t.isActive } })}
                className="text-evergreen hover:underline"
              >
                {t.isActive ? 'Disable' : 'Enable'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form
          className="flex flex-wrap gap-2"
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
          <input
            name="code"
            required
            placeholder="code (e.g. study)"
            className={`${input} max-w-40`}
          />
          <input name="name" required placeholder="Name" className={`${input} max-w-40`} />
          <input
            name="days"
            type="number"
            min={0}
            step="0.5"
            required
            placeholder="Days"
            className={`${input} w-24`}
          />
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="paid" defaultChecked /> Paid
          </label>
          <button type="submit" className={button}>
            Add type
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
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
    <form onSubmit={onSubmit} className={card}>
      <h2 className="font-medium text-charcoal">
        {role === 'coo' ? "Recover a CEO's access" : 'Hand over as CEO'}
      </h2>
      <p className="text-sm text-charcoal-soft">
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
        <input
          name="email"
          type="email"
          required
          placeholder="New verified email"
          className={input}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
      {done && <p className="text-sm text-forest">Request sent to the platform team.</p>}
      <button type="submit" className={button}>
        Send request
      </button>
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
    <section className={card}>
      <h2 className="font-medium text-charcoal">Export all data</h2>
      <p className="text-sm text-charcoal-soft">
        Downloads everything the organisation holds. It stays available for 15 days after a
        suspension.
      </p>
      <button type="button" disabled={pending} onClick={() => void download()} className={button}>
        {pending ? 'Preparing…' : 'Download export'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
    </section>
  );
}

function SettingsContent() {
  const { session } = useHrmsAuth();
  const canEdit = session?.role === 'ceo';
  const org = useQuery({
    queryKey: ['hrms', 'org', session?.activeMemberId],
    queryFn: () => hrmsFetch<HrmsOrg>('/org'),
  });

  return (
    <>
      <h1 className="text-xl font-semibold text-charcoal">Organisation settings</h1>
      {!canEdit && (
        <p className="text-sm text-charcoal-soft">Only the CEO can change these settings.</p>
      )}
      {org.data?.seats && (
        <section className={card}>
          <SeatBar seats={org.data.seats} />
          <p className="text-sm text-charcoal-soft">Plan: {org.data.seats.planCode}</p>
        </section>
      )}
      {org.data && (
        <SettingsForm
          key={JSON.stringify(org.data.settings)}
          settings={org.data.settings}
          canEdit={canEdit}
        />
      )}
      <NetworksCard canEdit={session?.role === 'ceo' || session?.role === 'coo'} />
      <HolidaysCard canEdit={canEdit} />
      <LeaveTypesCard canEdit={canEdit} />
      {session?.role === 'ceo' && <ExportCard />}
      {(session?.role === 'ceo' || session?.role === 'coo') && <RecoveryCard role={session.role} />}
    </>
  );
}

export default function OrgSettingsPage() {
  return (
    <RoleGate allow={['ceo', 'coo']}>
      <SettingsContent />
    </RoleGate>
  );
}
