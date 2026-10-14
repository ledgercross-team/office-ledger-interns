'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/hrms/role-gate';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import type { HrmsMember, HrmsProjectDetail, Paginated } from '@/lib/hrms/types';

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';

function NewProjectForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [managerIds, setManagerIds] = useState<string[]>([]);

  const managers = useQuery({
    queryKey: ['hrms', 'members', 'managers'],
    queryFn: () =>
      hrmsFetch<Paginated<HrmsMember>>('/members?role=manager&status=active&pageSize=100'),
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const optional = (key: string) => String(f.get(key) ?? '').trim() || undefined;
    setError(null);
    setPending(true);
    try {
      const created = await hrmsFetch<HrmsProjectDetail>('/projects', {
        method: 'POST',
        body: {
          name: String(f.get('name')).trim(),
          description: optional('description'),
          startDate: optional('startDate'),
          dueDate: optional('dueDate'),
          managerIds,
        },
      });
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'projects'] });
      router.replace(`/projects/${created.id}`);
    } catch (err) {
      setError(err instanceof HrmsApiError ? err.message : 'Something went wrong. Please try again.');
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-lg space-y-4 rounded-2xl border border-charcoal/10 bg-white p-4"
    >
      <h1 className="text-xl font-semibold text-charcoal">New project</h1>
      <label className="block space-y-1 text-sm font-medium text-charcoal">
        Name
        <input name="name" required maxLength={200} className={input} />
      </label>
      <label className="block space-y-1 text-sm font-medium text-charcoal">
        Description (optional)
        <textarea name="description" rows={3} maxLength={5000} className={input} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium text-charcoal">
          Start date
          <input name="startDate" type="date" className={input} />
        </label>
        <label className="block space-y-1 text-sm font-medium text-charcoal">
          Due date
          <input name="dueDate" type="date" className={input} />
        </label>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-charcoal">Managers</legend>
        <p className="text-xs text-charcoal-soft">
          A project needs at least one manager and one employee. Employees are invited from the
          project page.
        </p>
        {managers.data?.items.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={managerIds.includes(m.id)}
              onChange={(event) =>
                setManagerIds((ids) =>
                  event.target.checked ? [...ids, m.id] : ids.filter((id) => id !== m.id),
                )
              }
            />
            {m.fullName}
          </label>
        ))}
        {managers.data?.items.length === 0 && (
          <p className="text-sm text-charcoal-soft">No managers yet. Add one under People.</p>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-evergreen px-4 py-2 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create project'}
      </button>
    </form>
  );
}

export default function NewProjectPage() {
  return (
    <RoleGate allow={['ceo']}>
      <NewProjectForm />
    </RoleGate>
  );
}
