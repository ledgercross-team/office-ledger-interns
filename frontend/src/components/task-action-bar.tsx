'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { errorMessage } from '@/lib/format';
import type { Task, TaskAction } from '@/lib/types';

type Button = TaskAction | 'comment';

interface ButtonSpec {
  key: Button;
  label: string;
  // Shown when the button is disabled.
  hint: string;
  // Opens a dialog; the comment is required there.
  needsComment: boolean;
}

// Hints only describe the rule; whether a button is enabled comes from the API's allowedActions.
const BUTTONS: ButtonSpec[] = [
  { key: 'start', label: 'Start', hint: 'Only a to-do or delayed task can be started.', needsComment: false },
  { key: 'done', label: 'Done', hint: 'Only an in-progress or delayed task can be marked done.', needsComment: false },
  { key: 'delayed', label: 'Delayed', hint: 'Only a to-do or in-progress task can be marked delayed.', needsComment: true },
  { key: 'incomplete', label: 'Incomplete', hint: 'Only an open task can be marked incomplete.', needsComment: true },
  { key: 'comment', label: 'Comment', hint: '', needsComment: true },
  { key: 'reopen', label: 'Reopen', hint: 'Only a manager or admin can reopen a done or incomplete task.', needsComment: true },
  { key: 'cancel', label: 'Cancel', hint: 'Only a manager or admin can cancel a task that is not done.', needsComment: true },
];

export function TaskActionBar({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<ButtonSpec | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ spec, text }: { spec: ButtonSpec; text: string }) =>
      spec.key === 'comment'
        ? apiFetch(`/tasks/${task.id}/comments`, { method: 'POST', body: { body: text } })
        : apiFetch(`/tasks/${task.id}/status-changes`, {
            method: 'POST',
            body: { action: spec.key, comment: text || undefined },
          }),
    onSuccess: async () => {
      setDialog(null);
      setComment('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const enabled = (spec: ButtonSpec) =>
    spec.key === 'comment' || task.allowedActions?.includes(spec.key as TaskAction) === true;

  function press(spec: ButtonSpec) {
    setError(null);
    if (spec.needsComment) {
      setComment('');
      setDialog(spec);
    } else {
      mutation.mutate({ spec, text: '' });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Task actions">
        {BUTTONS.map((spec) => {
          const isEnabled = enabled(spec);
          return (
            <button
              key={spec.key}
              type="button"
              disabled={!isEnabled || mutation.isPending}
              title={isEnabled ? undefined : spec.hint}
              onClick={() => press(spec)}
              className="rounded border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {spec.label}
            </button>
          );
        })}
      </div>

      {!dialog && error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {dialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`dialog-title-${task.id}`}
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
        >
          <form
            className="w-full max-w-md space-y-3 rounded-lg border bg-background p-4"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate({ spec: dialog, text: comment.trim() });
            }}
          >
            <h2 id={`dialog-title-${task.id}`} className="font-semibold">
              {dialog.label}: {task.title}
            </h2>
            <label htmlFor={`comment-${task.id}`} className="block text-sm font-medium">
              Comment
            </label>
            <textarea
              id={`comment-${task.id}`}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              required
              maxLength={1000}
              rows={4}
              className="w-full rounded border px-3 py-2"
            />
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDialog(null);
                  setError(null);
                }}
                className="rounded border px-3 py-1 text-sm"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={mutation.isPending || comment.trim() === ''}
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-60"
              >
                {mutation.isPending ? 'Saving…' : dialog.label}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
