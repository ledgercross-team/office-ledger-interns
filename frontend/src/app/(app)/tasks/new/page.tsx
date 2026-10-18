'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Banner, Button, EmptyState, controlClass, labelClass } from '@/components/ui';
import { RoleGate } from '@/components/hrms/role-gate';
import { WorkloadChip } from '@/components/hrms/workload-chip';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import type {
  HrmsProject,
  HrmsProjectDetail,
  HrmsTask,
  Paginated,
  WorkloadItem,
} from '@/lib/hrms/types';

function NewTaskForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const [projectId, setProjectId] = useState(params.get('projectId') ?? '');
  // Set when a manager arrives from an approved create_task request.
  const requestId = params.get('requestId') ?? undefined;
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const projects = useQuery({
    queryKey: ['hrms', 'projects', 'task-new'],
    queryFn: () => hrmsFetch<Paginated<HrmsProject>>('/projects?status=active&pageSize=100'),
  });
  const project = useQuery({
    queryKey: ['hrms', 'projects', 'one', projectId],
    queryFn: () => hrmsFetch<HrmsProjectDetail>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  });

  const workload = useQuery({
    queryKey: ['hrms', 'workload'],
    queryFn: () => hrmsFetch<{ items: WorkloadItem[] }>('/workload'),
  });
  const workloadOf = (memberId: string) =>
    workload.data?.items.find((w) => w.memberId === memberId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    try {
      const created = await hrmsFetch<HrmsTask>(`/projects/${projectId}/tasks`, {
        method: 'POST',
        body: {
          title: String(f.get('title')).trim(),
          description: String(f.get('description') ?? '').trim() || undefined,
          urgency: String(f.get('urgency')),
          // The date input is a local calendar day; the task is due at the end of it.
          dueAt: new Date(`${String(f.get('dueDate'))}T23:59:00`).toISOString(),
          assigneeIds,
          requestId,
        },
      });
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'tasks'] });
      router.replace(`/tasks/${created.id}`);
    } catch (err) {
      setError(
        err instanceof HrmsApiError ? err.message : 'Something went wrong. Please try again.',
      );
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-2xl space-y-5 rounded-card border border-border bg-surface p-5"
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">New task</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Create a task, set its urgency and due date, then assign the people responsible.
        </p>
      </div>
      <label className={labelClass}>
        Project
        <select
          value={projectId}
          required
          onChange={(e) => {
            setProjectId(e.target.value);
            setAssigneeIds([]);
          }}
          className={controlClass}
        >
          <option value="">Choose…</option>
          {projects.data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Title
        <input name="title" required maxLength={200} className={controlClass} />
      </label>
      <label className={labelClass}>
        Description (optional)
        <textarea
          name="description"
          rows={3}
          maxLength={5000}
          className={`${controlClass} min-h-24 resize-y`}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Urgency
          <select name="urgency" defaultValue="medium" className={controlClass}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className={labelClass}>
          Due date
          <input name="dueDate" type="date" required className={controlClass} />
        </label>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-fg">Assign to</legend>
        <p className="text-sm text-fg-muted">
          A task needs at least one manager and one employee before work can start. You can save it
          now and assign later.
        </p>
        {project.data?.members.map((m) => (
          <label key={m.memberId} className="flex min-h-11 items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={assigneeIds.includes(m.memberId)}
              onChange={(e) =>
                setAssigneeIds((ids) =>
                  e.target.checked ? [...ids, m.memberId] : ids.filter((id) => id !== m.memberId),
                )
              }
            />
            {m.fullName} <span className="text-fg-muted">({m.role})</span>
            <WorkloadChip workload={workloadOf(m.memberId)} />
          </label>
        ))}
        {projectId && project.data?.members.length === 0 && (
          <EmptyState
            title="No project members yet"
            description="Add people to the project before assigning this task."
          />
        )}
      </fieldset>
      {error && (
        <Banner tone="danger" title="Could not create task">
          {error}
        </Banner>
      )}
      <Button type="submit" loading={pending} disabled={!projectId} loadingLabel="Creating">
        Create task
      </Button>
    </form>
  );
}

export default function NewTaskPage() {
  return (
    <RoleGate allow={['ceo', 'coo', 'manager']}>
      <Suspense>
        <NewTaskForm />
      </Suspense>
    </RoleGate>
  );
}
