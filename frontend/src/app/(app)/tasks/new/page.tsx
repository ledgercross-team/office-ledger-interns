'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/role-gate';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, fromZonedInput, MAX_DATE, toZonedInput } from '@/lib/format';
import { TASK_CATEGORIES } from '@/lib/task-meta';
import type { Paginated, Task, TaskCategory, TaskPriority, User } from '@/lib/types';

interface NewTask {
  title: string;
  description?: string;
  category: TaskCategory;
  priority: TaskPriority;
  deadline: string;
  assigneeId: string;
}

function NewTaskForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const timezone = user?.companyTimezone ?? 'UTC';
  // The earliest deadline the form allows: right now, on the company's clock.
  const earliest = toZonedInput(new Date().toISOString(), timezone);

  // Managers see only their own team here; admins see every manager and employee.
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
      category: String(form.get('category')) as TaskCategory,
      priority: String(form.get('priority')) as TaskPriority,
      // Typed on the company's clock, whatever timezone this browser is in.
      deadline: fromZonedInput(String(form.get('deadline')), timezone),
      assigneeId: String(form.get('assigneeId')),
    });
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-xl space-y-4">
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
          className="w-full rounded-xl border border-charcoal/15 px-3 py-2"
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
          className="w-full rounded-xl border border-charcoal/15 px-3 py-2"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="category" className="block text-sm font-medium">
          Type of work
        </label>
        <select
          id="category"
          name="category"
          defaultValue="general"
          className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
        >
          {TASK_CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
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
            className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="deadline" className="block text-sm font-medium">
            Deadline ({timezone})
          </label>
          <input
            id="deadline"
            name="deadline"
            type="datetime-local"
            required
            min={earliest}
            max={`${MAX_DATE}T23:59`}
            className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="assigneeId" className="block text-sm font-medium">
          Assign to
        </label>
        <select
          id="assigneeId"
          name="assigneeId"
          required
          defaultValue=""
          className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
        >
          <option value="" disabled>
            {people.isLoading ? 'Loading…' : 'Select a person'}
          </option>
          {people.data?.items
            .filter((person) => person.role !== 'admin')
            .map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName} ({person.role}
                {person.managerName ? `, reports to ${person.managerName}` : ''})
              </option>
            ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={create.isPending}
        className="rounded-xl bg-evergreen px-4 py-2 text-white disabled:opacity-60"
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
