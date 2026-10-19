'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { MemberChips, MemberSearch, type MemberOption } from '@/components/hrms/member-search';
import { RoleGate } from '@/components/hrms/role-gate';
import { Banner, Button, Input, PageHeader, PageShell, Textarea, cardClass } from '@/components/ui';
import { labelClass } from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import type { HrmsProjectDetail } from '@/lib/hrms/types';

function NewProjectForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [chosen, setChosen] = useState<MemberOption[]>([]);
  const managerIds = chosen.map((m) => m.id);

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
      setError(
        err instanceof HrmsApiError ? err.message : 'Something went wrong. Please try again.',
      );
      setPending(false);
    }
  }

  return (
    <PageShell className="w-full">
      <PageHeader
        title="New project"
        description="Set the project scope, dates, and managers before inviting the wider team."
      />
      <form onSubmit={onSubmit} className={`${cardClass} w-full space-y-6`}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <Input label="Name" name="name" required maxLength={200} />
          </div>
          <div className="lg:col-span-2">
            <Textarea label="Description (optional)" name="description" rows={4} maxLength={5000} />
          </div>
          <Input label="Start date" name="startDate" type="date" />
          <Input label="Due date" name="dueDate" type="date" />
        </div>
        <fieldset className="space-y-2">
          <legend className={labelClass}>Managers</legend>
          <p className="text-xs text-fg-muted">
            A project needs at least one manager and one employee. Employees are invited from the
            project page.
          </p>
          <MemberSearch
            label="Add a manager"
            role="manager"
            excludeIds={managerIds}
            onSelect={(m) => setChosen((list) => [...list, m])}
          />
          <MemberChips
            members={chosen}
            onRemove={(id) => setChosen((list) => list.filter((m) => m.id !== id))}
            emptyText="No managers chosen yet."
          />
        </fieldset>
        {error && (
          <Banner tone="danger" title="Could not create project">
            {error}
          </Banner>
        )}
        <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button
            type="submit"
            loading={pending}
            loadingLabel="Creating"
            className="w-full sm:w-auto"
          >
            Create project
          </Button>
        </div>
      </form>
    </PageShell>
  );
}

export default function NewProjectPage() {
  return (
    <RoleGate allow={['ceo']}>
      <NewProjectForm />
    </RoleGate>
  );
}
