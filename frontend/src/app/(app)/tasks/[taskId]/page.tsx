'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { MemberSearch, type MemberOption } from '@/components/hrms/member-search';
import { TaskFlags, TaskStatusBadge, UrgencyBadge } from '@/components/hrms/task-badges';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  controlClass,
  labelClass,
  linkClass,
} from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { actionsFrom, TASK_STATUS_LABELS, type TaskAction } from '@/lib/hrms/task-meta';
import { formatDateTime } from '@/lib/hrms/time';
import type { HrmsProjectDetail, HrmsTask, TaskHistoryItem } from '@/lib/hrms/types';

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

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

  if (task.isLoading) {
    return (
      <div className="space-y-4" aria-label="Loading task">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (task.error || !task.data) {
    return (
      <ErrorState
        title="Could not load task"
        message={task.error ? message(task.error) : 'Task not found.'}
        onRetry={() => void task.refetch()}
      />
    );
  }

  const t = task.data;
  const canManage =
    session?.role === 'ceo' || session?.role === 'coo' || session?.role === 'manager';
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
        <Link href="/tasks" className={`text-sm ${linkClass}`}>
          ← Tasks
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{t.title}</h1>
          <UrgencyBadge urgency={t.urgency} />
          <TaskStatusBadge status={t.status} />
          <TaskFlags flags={t.flags} />
        </div>
        <p className="text-sm text-fg-muted">
          <Link href={`/projects/${t.projectId}`} className={linkClass}>
            {t.projectName}
          </Link>{' '}
          · Due {formatDateTime(t.dueAt)}
        </p>
        {t.description && <p className="whitespace-pre-wrap text-sm text-fg">{t.description}</p>}
        {t.blockedReason && t.status === 'blocked' && (
          <p className="text-sm text-danger-fg">Blocked: {t.blockedReason}</p>
        )}
        {t.cancelReason && t.status === 'cancelled' && (
          <p className="text-sm text-fg-muted">Cancelled: {t.cancelReason}</p>
        )}
      </div>

      {error && (
        <Banner tone="danger" title="Could not update task">
          {error}
        </Banner>
      )}

      {actions.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-semibold text-fg">Move this task</h2>
          {t.flags.noAssignee || t.flags.noManager || t.flags.noEmployee ? (
            <p className="text-xs text-fg-muted">
              It needs at least one manager and one employee before work can start.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button
                key={`${a.to}-${a.label}`}
                variant={a.needs ? 'secondary' : 'primary'}
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
              </Button>
            ))}
          </div>
          {pendingAction && (
            <div className="space-y-2">
              <label className={labelClass}>
                {pendingAction.needs === 'reason'
                  ? `Reason for “${pendingAction.label}” (required)`
                  : `Comment for “${pendingAction.label}” (required)`}
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  className={`${controlClass} min-h-24 resize-y`}
                />
              </label>
              <div className="flex gap-2">
                <Button
                  disabled={text.trim().length === 0}
                  onClick={() =>
                    submitAction(
                      pendingAction,
                      pendingAction.needs === 'reason'
                        ? { reason: text.trim() }
                        : { comment: text.trim() },
                    )
                  }
                >
                  {pendingAction.label}
                </Button>
                <Button variant="secondary" onClick={() => setPendingAction(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold text-fg">People on this task</h2>
        <ul className="divide-y divide-border text-sm">
          {t.assignees.map((a) => (
            <li key={a.memberId} className="flex items-center justify-between py-2">
              <span>
                <span className="font-medium text-fg">{a.fullName}</span>
                <span className="ml-2 text-fg-muted">{a.role}</span>
              </span>
              {canManage && !closed && (
                <button
                  type="button"
                  className="font-medium text-danger-fg underline-offset-2 hover:underline"
                  onClick={() =>
                    void run(() =>
                      hrmsFetch<HrmsTask>(`/tasks/${t.id}/assignees/${a.memberId}`, {
                        method: 'DELETE',
                      }),
                    )
                  }
                >
                  Remove
                </button>
              )}
            </li>
          ))}
          {t.assignees.length === 0 && (
            <li>
              <EmptyState
                title="No assignees yet"
                description="Add someone from the project to assign this task."
              />
            </li>
          )}
        </ul>
        {canManage && !closed && addable.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1">
              <MemberSearch
                label="Add someone from the project"
                localOptions={addable.map((m) => ({
                  id: m.memberId,
                  fullName: m.fullName,
                  role: m.role,
                }))}
                selected={addPick}
                onSelect={setAddPick}
                onClear={() => setAddPick(null)}
              />
            </div>
            <Button
              disabled={!addId}
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
            </Button>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold text-fg">History</h2>
        {history.isLoading && <Skeleton className="h-24 w-full" />}
        {history.error && (
          <ErrorState
            title="Could not load task history"
            message={message(history.error)}
            onRetry={() => void history.refetch()}
          />
        )}
        {history.data && history.data.items.length === 0 && (
          <EmptyState
            title="No history yet"
            description="Task status changes and comments will appear here."
          />
        )}
        {history.data && history.data.items.length > 0 && (
          <ol className="space-y-2 text-sm">
            {history.data.items.map((h) => (
              <li key={h.id}>
                <span className="font-medium text-fg">
                  {h.fromStatus ? `${TASK_STATUS_LABELS[h.fromStatus]} → ` : 'Created as '}
                  {TASK_STATUS_LABELS[h.toStatus]}
                </span>
                <span className="ml-2 text-xs text-fg-muted">
                  {h.changedBy?.fullName ?? 'System'} · {formatDateTime(h.changedAt)}
                </span>
                {h.comment && <p className="text-fg">&ldquo;{h.comment}&rdquo;</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
