'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notFound, useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { DateTimePicker } from '@/components/date-time-picker';
import { RoleGate } from '@/components/role-gate';
import { TaskCard } from '@/components/task-card';
import { ApiError, apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import {
  errorMessage,
  formatDateTime,
  formatGmtOffset,
  fromZonedInput,
  MAX_DATE,
  toZonedInput,
} from '@/lib/format';
import { TASK_CATEGORIES } from '@/lib/task-meta';
import type { Paginated, Task, TaskActivity, TaskCategory, TaskPriority, User } from '@/lib/types';

const STATUS_LABELS: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  delayed: 'Delayed',
  done: 'Done',
  incomplete: 'Incomplete',
  cancelled: 'Cancelled',
};

function EditForm({ task, timezone }: { task: Task; timezone: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deadline, setDeadline] = useState(() => toZonedInput(task.deadline, timezone));
  const timezoneLabel = formatGmtOffset(timezone);

  // Whoever may edit the task may hand it to someone else they manage.
  const people = useQuery({
    queryKey: ['people', 'assignable'],
    queryFn: () => apiFetch<Paginated<User>>('/users?isActive=true&pageSize=100'),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<Task>(`/tasks/${task.id}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setError(null);
    setSaved(false);
    if (!deadline) {
      setError('Please choose a deadline.');
      return;
    }
    save.mutate({
      title: String(form.get('title')).trim(),
      description: String(form.get('description')).trim(),
      category: String(form.get('category')) as TaskCategory,
      priority: String(form.get('priority')) as TaskPriority,
      deadline: fromZonedInput(deadline, timezone),
      assigneeId: String(form.get('assigneeId')),
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
          className="min-h-11 w-full rounded-xl border border-charcoal/15 px-3 py-2"
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
          <label htmlFor="edit-category" className="block text-sm font-medium">
            Type of work
          </label>
          <select
            id="edit-category"
            name="category"
            defaultValue={task.category}
            className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
          >
            {TASK_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="edit-assignee" className="block text-sm font-medium">
            Assigned to
          </label>
          <select
            id="edit-assignee"
            name="assigneeId"
            defaultValue={task.assigneeId}
            className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
          >
            {/* The current assignee stays selectable even if the list has not loaded. */}
            {!people.data?.items.some((person) => person.id === task.assigneeId) && (
              <option value={task.assigneeId}>{task.assigneeName ?? 'Current assignee'}</option>
            )}
            {people.data?.items
              .filter((person) => person.role !== 'admin')
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName} ({person.role})
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="edit-priority" className="block text-sm font-medium">
            Priority
          </label>
          <select
            id="edit-priority"
            name="priority"
            defaultValue={task.priority}
            className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="edit-deadline-button" className="block text-sm font-medium">
            Deadline ({timezoneLabel})
          </label>
          <DateTimePicker
            id="edit-deadline"
            name="deadline"
            value={deadline}
            onChange={setDeadline}
            min={toZonedInput(new Date().toISOString(), timezone)}
            max={`${MAX_DATE}T23:59`}
            timezone={timezone}
            timezoneLabel={timezoneLabel}
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
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-evergreen px-3 py-2 text-sm text-white disabled:opacity-60 sm:w-auto"
      >
        {save.isPending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}

function Timeline({ taskId, timezone }: { taskId: string; timezone: string }) {
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
              <span className="text-charcoal-soft"> · {formatDateTime(entry.createdAt, timezone)}</span>
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
  const { user } = useAuth();
  const timezone = user?.companyTimezone ?? 'UTC';
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
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-4">
      <TaskCard task={task} linkTitle={false} timezone={timezone} />
      {task.description && (
        <section className="space-y-1">
          <h2 className="font-semibold">Description</h2>
          <p className="break-words whitespace-pre-wrap text-sm">{task.description}</p>
        </section>
      )}
      {task.canEdit && <EditForm task={task} timezone={timezone} />}
      <Timeline taskId={task.id} timezone={timezone} />
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
