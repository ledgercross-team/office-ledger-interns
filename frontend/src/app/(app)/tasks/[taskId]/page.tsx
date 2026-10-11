'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notFound, useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/role-gate';
import { TaskCard } from '@/components/task-card';
import { ApiError, apiFetch } from '@/lib/api-client';
import { errorMessage, formatDateTime } from '@/lib/format';
import type { Task, TaskActivity, TaskPriority } from '@/lib/types';

const STATUS_LABELS: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  delayed: 'Delayed',
  done: 'Done',
  incomplete: 'Incomplete',
  cancelled: 'Cancelled',
};

// <input type="datetime-local"> wants local time without a zone.
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function EditForm({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<Task>(`/tasks/${task.id}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setError(null);
    setSaved(false);
    save.mutate({
      title: String(form.get('title')).trim(),
      description: String(form.get('description')).trim(),
      priority: String(form.get('priority')) as TaskPriority,
      deadline: new Date(String(form.get('deadline'))).toISOString(),
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">Edit task</h2>
      <div className="space-y-1">
        <label htmlFor="edit-title" className="block text-sm font-medium">
          Title
        </label>
        <input
          id="edit-title"
          name="title"
          defaultValue={task.title}
          required
          maxLength={200}
          className="w-full rounded-xl border border-charcoal/15 px-3 py-2"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="edit-description" className="block text-sm font-medium">
          Description
        </label>
        <textarea
          id="edit-description"
          name="description"
          defaultValue={task.description ?? ''}
          rows={3}
          maxLength={5000}
          className="w-full rounded-xl border border-charcoal/15 px-3 py-2"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="edit-priority" className="block text-sm font-medium">
            Priority
          </label>
          <select
            id="edit-priority"
            name="priority"
            defaultValue={task.priority}
            className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="edit-deadline" className="block text-sm font-medium">
            Deadline
          </label>
          <input
            id="edit-deadline"
            name="deadline"
            type="datetime-local"
            defaultValue={toLocalInput(task.deadline)}
            required
            className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
      {saved && <p className="text-sm text-evergreen">Saved.</p>}
      <button
        type="submit"
        disabled={save.isPending}
        className="rounded-xl bg-evergreen px-3 py-1 text-sm text-white disabled:opacity-60"
      >
        {save.isPending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}

function Timeline({ taskId }: { taskId: string }) {
  const activity = useQuery({
    queryKey: ['tasks', 'activity', taskId],
    queryFn: () => apiFetch<{ items: TaskActivity[] }>(`/tasks/${taskId}/activity`),
  });

  return (
    <section aria-label="Activity" className="space-y-2">
      <h2 className="font-semibold">Activity</h2>
      {activity.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {activity.data?.items.length === 0 && (
        <p className="text-sm text-charcoal-soft">No activity yet.</p>
      )}
      <ol className="space-y-2">
        {activity.data?.items.map((entry) => (
          <li key={entry.id} className="rounded-xl border border-charcoal/15 p-3 text-sm">
            <p>
              <span className="font-medium">{entry.actorName ?? 'Someone'}</span>{' '}
              {entry.type === 'status_change'
                ? `changed the status from ${STATUS_LABELS[entry.fromStatus ?? ''] ?? '—'} to ${STATUS_LABELS[entry.toStatus ?? ''] ?? '—'}`
                : 'commented'}
              <span className="text-charcoal-soft"> · {formatDateTime(entry.createdAt)}</span>
            </p>
            {entry.comment && <p className="mt-1 whitespace-pre-wrap">{entry.comment}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const query = useQuery({
    queryKey: ['tasks', 'detail', taskId],
    queryFn: () => apiFetch<Task>(`/tasks/${taskId}`),
  });

  if (query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400)) {
    notFound();
  }
  if (query.isLoading) {
    return <p className="text-sm text-charcoal-soft">Loading…</p>;
  }
  if (query.error || !query.data) {
    return (
      <p role="alert" className="text-sm text-alert-deep">
        {errorMessage(query.error)}
      </p>
    );
  }

  const task = query.data;

  return (
    <div className="max-w-3xl space-y-4">
      <TaskCard task={task} linkTitle={false} />
      {task.description && (
        <section className="space-y-1">
          <h2 className="font-semibold">Description</h2>
          <p className="whitespace-pre-wrap text-sm">{task.description}</p>
        </section>
      )}
      {task.canEdit && <EditForm task={task} />}
      <Timeline taskId={task.id} />
    </div>
  );
}

export default function TaskDetailPage() {
  return (
    <RoleGate allow={['admin', 'manager', 'employee']}>
      <TaskDetail />
    </RoleGate>
  );
}
