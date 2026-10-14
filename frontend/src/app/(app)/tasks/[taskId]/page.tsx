'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { MemberSearch, type MemberOption } from '@/components/hrms/member-search';
import { TaskFlags, TaskStatusBadge, UrgencyBadge } from '@/components/hrms/task-badges';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { actionsFrom, TASK_STATUS_LABELS, type TaskAction } from '@/lib/hrms/task-meta';
import { formatDateTime } from '@/lib/hrms/time';
import type { HrmsProjectDetail, HrmsTask, TaskHistoryItem } from '@/lib/hrms/types';

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';
const card = 'space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4';
const primary =
  'rounded-xl bg-evergreen px-3 py-1.5 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60';
const secondary = 'rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm hover:bg-mist/60 disabled:opacity-60';

export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<TaskAction | null>(null);
  const [text, setText] = useState('');
  const [addPick, setAddPick] = useState<MemberOption | null>(null);
  const addId = addPick?.id ?? '';

  const taskKey = ['hrms', 'tasks', 'one', taskId];
  const task = useQuery({
    queryKey: taskKey,
    queryFn: () => hrmsFetch<HrmsTask>(`/tasks/${taskId}`),
  });
  const history = useQuery({
    queryKey: ['hrms', 'tasks', 'history', taskId],
    queryFn: () => hrmsFetch<{ items: TaskHistoryItem[] }>(`/tasks/${taskId}/history`),
  });
  const project = useQuery({
    queryKey: ['hrms', 'projects', 'one', task.data?.projectId],
    queryFn: () => hrmsFetch<HrmsProjectDetail>(`/projects/${task.data?.projectId}`),
    enabled: Boolean(task.data) && session?.role !== 'employee',
  });

  const refresh = (data: HrmsTask) => {
    queryClient.setQueryData(taskKey, data);
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'projects'] });
  };

  async function run(fn: () => Promise<HrmsTask>, after?: () => void) {
    setError(null);
    try {
      refresh(await fn());
      after?.();
    } catch (err) {
      setError(message(err));
    }
  }

  if (task.isLoading) return <p className="text-sm text-charcoal-soft">Loading…</p>;
  if (task.error || !task.data) {
    return (
      <p role="alert" className="text-sm text-alert-deep">
        {task.error ? message(task.error) : 'Task not found.'}
      </p>
    );
  }

  const t = task.data;
  const canManage = session?.role === 'ceo' || session?.role === 'coo' || session?.role === 'manager';
  const closed = t.status === 'done' || t.status === 'cancelled';
  const actions = actionsFrom(t.status);
  const assigneeIds = t.assignees.map((a) => a.memberId);
  const addable = project.data?.members.filter((m) => !assigneeIds.includes(m.memberId)) ?? [];

  function submitAction(action: TaskAction, body?: { comment?: string; reason?: string }) {
    void run(
      () =>
        hrmsFetch<HrmsTask>(`/tasks/${t.id}/status`, {
          method: 'POST',
          body: { status: action.to, ...body },
        }),
      () => {
        setPendingAction(null);
        setText('');
        void queryClient.invalidateQueries({ queryKey: ['hrms', 'tasks', 'history', taskId] });
      },
    );
  }

  return (
    <>
      <div className="space-y-2">
        <Link href="/tasks" className="text-sm text-evergreen hover:underline">
          ← Tasks
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-charcoal">{t.title}</h1>
          <UrgencyBadge urgency={t.urgency} />
          <TaskStatusBadge status={t.status} />
          <TaskFlags flags={t.flags} />
        </div>
        <p className="text-sm text-charcoal-soft">
          <Link href={`/projects/${t.projectId}`} className="text-evergreen hover:underline">
            {t.projectName}
          </Link>{' '}
          · Due {formatDateTime(t.dueAt)}
        </p>
        {t.description && <p className="whitespace-pre-wrap text-sm text-charcoal">{t.description}</p>}
        {t.blockedReason && t.status === 'blocked' && (
          <p className="text-sm text-alert-deep">Blocked: {t.blockedReason}</p>
        )}
        {t.cancelReason && t.status === 'cancelled' && (
          <p className="text-sm text-charcoal-soft">Cancelled: {t.cancelReason}</p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}

      {actions.length > 0 && (
        <section className={card}>
          <h2 className="font-medium text-charcoal">Move this task</h2>
          {t.flags.noAssignee || t.flags.noManager || t.flags.noEmployee ? (
            <p className="text-xs text-charcoal-soft">
              It needs at least one manager and one employee before work can start.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <button
                key={`${a.to}-${a.label}`}
                type="button"
                className={a.needs ? secondary : primary}
                onClick={() => {
                  setError(null);
                  if (a.needs) {
                    setPendingAction(a);
                    setText('');
                  } else {
                    submitAction(a);
                  }
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
          {pendingAction && (
            <div className="space-y-2">
              <label className="block space-y-1 text-sm text-charcoal">
                {pendingAction.needs === 'reason'
                  ? `Reason for “${pendingAction.label}” (required)`
                  : `Comment for “${pendingAction.label}” (required)`}
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className={input} />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={text.trim().length === 0}
                  className={primary}
                  onClick={() =>
                    submitAction(
                      pendingAction,
                      pendingAction.needs === 'reason' ? { reason: text.trim() } : { comment: text.trim() },
                    )
                  }
                >
                  {pendingAction.label}
                </button>
                <button type="button" className={secondary} onClick={() => setPendingAction(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className={card}>
        <h2 className="font-medium text-charcoal">People on this task</h2>
        <ul className="divide-y divide-charcoal/5 text-sm">
          {t.assignees.map((a) => (
            <li key={a.memberId} className="flex items-center justify-between py-2">
              <span>
                <span className="font-medium text-charcoal">{a.fullName}</span>
                <span className="ml-2 text-charcoal-soft">{a.role}</span>
              </span>
              {canManage && !closed && (
                <button
                  type="button"
                  className="text-alert-deep hover:underline"
                  onClick={() =>
                    void run(() =>
                      hrmsFetch<HrmsTask>(`/tasks/${t.id}/assignees/${a.memberId}`, { method: 'DELETE' }),
                    )
                  }
                >
                  Remove
                </button>
              )}
            </li>
          ))}
          {t.assignees.length === 0 && <li className="py-2 text-charcoal-soft">Nobody yet.</li>}
        </ul>
        {canManage && !closed && addable.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1">
              <MemberSearch
                label="Add someone from the project"
                localOptions={addable.map((m) => ({ id: m.memberId, fullName: m.fullName, role: m.role }))}
                selected={addPick}
                onSelect={setAddPick}
                onClear={() => setAddPick(null)}
              />
            </div>
            <button
              type="button"
              disabled={!addId}
              className={primary}
              onClick={() =>
                void run(
                  () =>
                    hrmsFetch<HrmsTask>(`/tasks/${t.id}/assignees`, {
                      method: 'POST',
                      body: { memberId: addId },
                    }),
                  () => setAddPick(null),
                )
              }
            >
              Add
            </button>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="font-medium text-charcoal">History</h2>
        <ol className="space-y-2 text-sm">
          {history.data?.items.map((h) => (
            <li key={h.id}>
              <span className="font-medium text-charcoal">
                {h.fromStatus ? `${TASK_STATUS_LABELS[h.fromStatus]} → ` : 'Created as '}
                {TASK_STATUS_LABELS[h.toStatus]}
              </span>
              <span className="ml-2 text-xs text-charcoal-soft">
                {h.changedBy?.fullName ?? 'System'} · {formatDateTime(h.changedAt)}
              </span>
              {h.comment && <p className="text-charcoal">&ldquo;{h.comment}&rdquo;</p>}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
