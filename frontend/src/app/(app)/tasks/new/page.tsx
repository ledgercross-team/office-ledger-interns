'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/role-gate';
import { apiFetch } from '@/lib/api-client';
import { errorMessage } from '@/lib/format';
import type { Paginated, Task, TaskPriority, User } from '@/lib/types';

interface NewTask {
  title: string;
  description?: string;
  priority: TaskPriority;
  deadline: string;
  assigneeId: string;
}

function NewTaskForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // The API only returns people this user may assign tasks to.
  const people = useQuery({
    queryKey: ['people', 'assignable'],
    queryFn: () => apiFetch<Paginated<User>>('/users?isActive=true&pageSize=100'),
  });

  const create = useMutation({
    mutationFn: (body: NewTask) => apiFetch<Task>('/tasks', { method: 'POST', body }),
    onSuccess: async (task) => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      router.push(`/tasks/${task.id}`);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const description = String(form.get('description')).trim();

    setError(null);
    create.mutate({
      title: String(form.get('title')).trim(),
      description: description || undefined,
      priority: String(form.get('priority')) as TaskPriority,
      deadline: new Date(String(form.get('deadline'))).toISOString(),
      assigneeId: String(form.get('assigneeId')),
    });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">New task</h1>

      <div className="space-y-1">
        <label htmlFor="title" className="block text-sm font-medium">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          className="w-full rounded border px-3 py-2"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="description" className="block text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={5000}
          className="w-full rounded border px-3 py-2"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="priority" className="block text-sm font-medium">
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue="medium"
            className="w-full rounded border bg-background px-3 py-2"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="deadline" className="block text-sm font-medium">
            Deadline
          </label>
          <input
            id="deadline"
            name="deadline"
            type="datetime-local"
            required
            className="w-full rounded border bg-background px-3 py-2"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="assigneeId" className="block text-sm font-medium">
          Assignee
        </label>
        <select
          id="assigneeId"
          name="assigneeId"
          required
          defaultValue=""
          className="w-full rounded border bg-background px-3 py-2"
        >
          <option value="" disabled>
            {people.isLoading ? 'Loading…' : 'Select a person'}
          </option>
          {people.data?.items.map((person) => (
            <option key={person.id} value={person.id}>
              {person.fullName} ({person.role})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={create.isPending}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
      >
        {create.isPending ? 'Creating…' : 'Create task'}
      </button>
    </form>
  );
}

export default function NewTaskPage() {
  return (
    <RoleGate allow={['admin', 'manager']}>
      <NewTaskForm />
    </RoleGate>
  );
}
