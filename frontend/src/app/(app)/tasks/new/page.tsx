'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DateTimePicker } from '@/components/date-time-picker';
import { RoleGate } from '@/components/role-gate';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, formatGmtOffset, fromZonedInput, MAX_DATE, toZonedInput } from '@/lib/format';
import { TASK_CATEGORIES } from '@/lib/task-meta';
import type {
  CreateTaskResponse,
  Paginated,
  TaskCategory,
  TaskPriority,
  User,
} from '@/lib/types';

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
  const [notice, setNotice] = useState<string | null>(null);
  const [deadline, setDeadline] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const timezone = user?.companyTimezone ?? 'UTC';
  const timezoneLabel = formatGmtOffset(timezone);
  // The earliest deadline the form allows: right now, on the company's clock.
  const earliest = toZonedInput(new Date().toISOString(), timezone);

  // Managers see every active employee so they can request approval for
  // employees outside their own team. Admins also see active managers.
  const people = useQuery({
    queryKey: ['people', 'assignable', user?.role],
    queryFn: () => apiFetch<Paginated<User>>('/users/assignable'),
    enabled: Boolean(user),
  });

  const selectedPerson = people.data?.items.find((person) => person.id === assigneeId);
  const needsApproval = user?.role === 'manager' && Boolean(selectedPerson && selectedPerson.managerId !== user.id);

  const create = useMutation({
    mutationFn: (body: NewTask) => apiFetch<CreateTaskResponse>('/tasks', { method: 'POST', body }),
    onSuccess: async (result) => {
      formRef.current?.reset();
      setDeadline('');
      setAssigneeId('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      if ('status' in result && result.status === 'pending_approval') {
        setNotice(
          `Admin approval requested for ${result.request.employeeName}. The task will be created after approval.`,
        );
        return;
      }
      router.push(`/tasks/${result.id}`);
    },
    onError: (err) => {
      setNotice(null);
      setError(errorMessage(err));
    },
  });

  useEffect(() => {
    function resetRestoredForm(event: PageTransitionEvent) {
      if (event.persisted) {
        formRef.current?.reset();
        setDeadline('');
        setAssigneeId('');
        setError(null);
        setNotice(null);
      }
    }

    window.addEventListener('pageshow', resetRestoredForm);
    return () => window.removeEventListener('pageshow', resetRestoredForm);
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const description = String(form.get('description')).trim();

    setError(null);
    setNotice(null);
    if (!deadline) {
      setError('Please choose a deadline.');
      return;
    }
    create.mutate({
      title: String(form.get('title')).trim(),
      description: description || undefined,
      category: String(form.get('category')) as TaskCategory,
      priority: String(form.get('priority')) as TaskPriority,
      // Typed on the company's clock, whatever timezone this browser is in.
      deadline: fromZonedInput(deadline, timezone),
      assigneeId: String(form.get('assigneeId')),
    });
  }

  return (
    <form
      ref={formRef}
      autoComplete="off"
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-2xl space-y-4 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:p-6"
    >
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
          className="min-h-11 w-full rounded-xl border border-charcoal/15 px-3 py-2"
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
          className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
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
            className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="deadline-button" className="block text-sm font-medium">
            Deadline ({timezoneLabel})
          </label>
          <DateTimePicker
            id="deadline"
            name="deadline"
            value={deadline}
            onChange={setDeadline}
            min={earliest}
            max={`${MAX_DATE}T23:59`}
            timezone={timezone}
            timezoneLabel={timezoneLabel}
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
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
        >
          <option value="" disabled>
            {people.isLoading
              ? 'Loading employees…'
              : people.data?.items.length
                ? user?.role === 'manager'
                  ? 'Select an employee'
                  : 'Select a person'
                : user?.role === 'manager'
                  ? 'No active employees available'
                  : 'No assignable people found'}
          </option>
          {people.data?.items
            .map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName} ({person.role}
                {person.managerName ? `, reports to ${person.managerName}` : ', currently unassigned'})
              </option>
            ))}
        </select>
        {user?.role === 'manager' && (
          <p className="text-xs text-charcoal-soft">
            Employees on your team are assigned immediately. Other employees require admin approval.
          </p>
        )}
      </div>

      {notice && (
        <p role="status" className="rounded-xl bg-mist px-3 py-2 text-sm text-forest">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={create.isPending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-evergreen px-4 py-2 text-white disabled:opacity-60 sm:w-auto"
      >
        {create.isPending ? 'Submitting…' : needsApproval ? 'Request admin approval' : 'Create task'}
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
