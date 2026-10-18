'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CompletionPanel } from '@/components/hrms/completion-panel';
import { MemberSearch, type MemberOption } from '@/components/hrms/member-search';
import { ProgressBar } from '@/components/hrms/progress-bar';
import { ProjectFlags, ProjectStatusBadge } from '@/components/hrms/project-status';
import { Banner, ErrorState, Skeleton } from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsProjectDetail, ProjectInvite } from '@/lib/hrms/types';

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';
const card = 'space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4';
const primary =
  'rounded-xl bg-evergreen px-4 py-2 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60';

function PeoplePicker({
  role,
  excludeIds,
  label,
  action,
  onPick,
}: {
  role: 'manager' | 'employee';
  excludeIds: string[];
  label: string;
  action: string;
  onPick: (memberId: string) => Promise<void>;
}) {
  const [picked, setPicked] = useState<MemberOption | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!picked) return;
    setPending(true);
    try {
      await onPick(picked.id);
      setPicked(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="min-w-64 flex-1">
        <MemberSearch
          label={label}
          role={role}
          excludeIds={excludeIds}
          selected={picked}
          onSelect={setPicked}
          onClear={() => setPicked(null)}
        />
      </div>
      <button type="submit" disabled={!picked || pending} className={primary}>
        {action}
      </button>
    </form>
  );
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const key = ['hrms', 'projects', 'one', projectId];
  const project = useQuery({
    queryKey: key,
    queryFn: () => hrmsFetch<HrmsProjectDetail>(`/projects/${projectId}`),
  });

  const apply = (data: HrmsProjectDetail) => {
    queryClient.setQueryData(key, data);
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'projects'] });
  };

  async function run<T>(fn: () => Promise<T>, then?: (value: T) => void): Promise<void> {
    setError(null);
    setNotice(null);
    try {
      const value = await fn();
      then?.(value);
    } catch (err) {
      setError(message(err));
    }
  }

  if (project.isLoading) {
    return (
      <div className="space-y-4" aria-label="Loading project">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (project.error || !project.data) {
    return (
      <ErrorState
        title="Could not load project"
        message={project.error ? message(project.error) : 'Project not found.'}
        onRetry={() => void project.refetch()}
      />
    );
  }

  const p = project.data;
  const isCeo = session?.role === 'ceo';
  const isCeoOrCoo = isCeo || session?.role === 'coo';
  const canEdit = isCeoOrCoo || p.iAmLead;
  const editable = p.status === 'active' || p.status === 'pending_lead_approval';
  const memberIds = p.members.map((m) => m.memberId);

  return (
    <>
      <div className="space-y-2">
        <Link href="/projects" className="text-sm text-evergreen hover:underline">
          ← Projects
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-charcoal">{p.name}</h1>
          <ProjectStatusBadge status={p.status} />
          <ProjectFlags flags={p.flags} />
        </div>
        {p.description && <p className="text-sm text-charcoal">{p.description}</p>}
        <p className="text-xs text-charcoal-soft">
          {p.startDate ? `From ${p.startDate}` : ''} {p.dueDate ? `· Due ${p.dueDate}` : ''}
        </p>
        <ProgressBar progress={p.progress} />
        <p className="text-sm">
          <Link href={`/tasks?projectId=${p.id}`} className="text-evergreen hover:underline">
            View tasks
          </Link>
          {editable && (isCeoOrCoo || p.myRole === 'manager') && (
            <>
              {' · '}
              <Link
                href={`/tasks/new?projectId=${p.id}`}
                className="text-evergreen hover:underline"
              >
                New task
              </Link>
            </>
          )}
        </p>
      </div>

      {error && (
        <Banner tone="danger" title="Could not save project">
          {error}
        </Banner>
      )}
      {notice && (
        <Banner tone="success" title="Project saved">
          {notice}
        </Banner>
      )}

      <CompletionPanel project={p} onChange={apply} />

      <section className={card}>
        <h2 className="font-medium text-charcoal">People</h2>
        <ul className="divide-y divide-charcoal/5 text-sm">
          {p.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium text-charcoal">{m.fullName}</span>
                <span className="ml-2 text-charcoal-soft">{m.role}</span>
                {m.isLead && (
                  <span className="ml-2 rounded-full bg-mist px-2 py-0.5 text-xs text-forest">
                    Project lead
                  </span>
                )}
                {m.ticked === true && <span className="ml-2 text-xs text-evergreen">ticked</span>}
              </span>
              {editable && (
                <span className="flex gap-3">
                  {isCeoOrCoo && m.role === 'manager' && (
                    <button
                      type="button"
                      className="text-evergreen hover:underline"
                      onClick={() =>
                        void run(
                          () =>
                            hrmsFetch<HrmsProjectDetail>(
                              `/projects/${p.id}/members/${m.memberId}/lead`,
                              { method: 'PATCH', body: { isLead: !m.isLead } },
                            ),
                          apply,
                        )
                      }
                    >
                      {m.isLead ? 'Remove lead tag' : 'Make lead'}
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      className="text-alert-deep hover:underline"
                      onClick={() =>
                        void run(
                          () =>
                            hrmsFetch<HrmsProjectDetail>(
                              `/projects/${p.id}/members/${m.memberId}`,
                              { method: 'DELETE' },
                            ),
                          apply,
                        )
                      }
                    >
                      Remove
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
          {p.members.length === 0 && <li className="py-2 text-charcoal-soft">Nobody yet.</li>}
        </ul>

        {editable && isCeoOrCoo && (
          <PeoplePicker
            role="manager"
            excludeIds={memberIds}
            label="Add a manager"
            action="Add manager"
            onPick={(memberId) =>
              run(
                () =>
                  hrmsFetch<HrmsProjectDetail>(`/projects/${p.id}/members`, {
                    method: 'POST',
                    body: { memberId },
                  }),
                apply,
              )
            }
          />
        )}
        {editable && (isCeoOrCoo || p.myRole === 'manager') && (
          <PeoplePicker
            role="employee"
            excludeIds={memberIds}
            label="Invite an employee"
            action="Send invite"
            onPick={(memberId) =>
              run(
                () =>
                  hrmsFetch<ProjectInvite>(`/projects/${p.id}/invites`, {
                    method: 'POST',
                    body: { memberId },
                  }),
                (invite) =>
                  setNotice(
                    `Invite sent to ${invite.invitee.fullName}. They can accept or decline it.`,
                  ),
              )
            }
          />
        )}
        {editable && p.myRole === 'manager' && !isCeoOrCoo && (
          <p className="text-xs text-charcoal-soft">
            A manager can send an invite only after an add-to-project request is approved.
          </p>
        )}
      </section>

      {canEdit && editable && (
        <form
          key={p.name + (p.description ?? '') + (p.dueDate ?? '')}
          className={card}
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            const body: Record<string, string> = {
              name: String(f.get('name')).trim(),
              description: String(f.get('description') ?? ''),
            };
            for (const k of ['startDate', 'dueDate']) {
              const v = String(f.get(k) ?? '');
              if (v) body[k] = v;
            }
            void run(
              () => hrmsFetch<HrmsProjectDetail>(`/projects/${p.id}`, { method: 'PATCH', body }),
              (data) => {
                apply(data);
                setNotice('Saved.');
              },
            );
          }}
        >
          <h2 className="font-medium text-charcoal">Details</h2>
          <label className="block space-y-1 text-sm text-charcoal">
            Name
            <input name="name" defaultValue={p.name} required className={input} />
          </label>
          <label className="block space-y-1 text-sm text-charcoal">
            Description
            <textarea
              name="description"
              defaultValue={p.description ?? ''}
              rows={3}
              className={input}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm text-charcoal">
              Start date
              <input
                name="startDate"
                type="date"
                defaultValue={p.startDate ?? ''}
                className={input}
              />
            </label>
            <label className="block space-y-1 text-sm text-charcoal">
              Due date
              <input name="dueDate" type="date" defaultValue={p.dueDate ?? ''} className={input} />
            </label>
          </div>
          <button type="submit" className={primary}>
            Save
          </button>
        </form>
      )}

      {isCeo && p.status !== 'archived' && (
        <section className="max-w-md space-y-2 rounded-2xl border border-alert/30 bg-alert-tint p-4">
          <h2 className="font-medium text-alert-deep">Archive</h2>
          <p className="text-sm text-charcoal">
            The project becomes read-only and its open tasks are cancelled automatically.
          </p>
          {confirmArchive ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  void run(
                    () =>
                      hrmsFetch<HrmsProjectDetail>(`/projects/${p.id}/archive`, { method: 'POST' }),
                    (data) => {
                      setConfirmArchive(false);
                      apply(data);
                    },
                  )
                }
                className="rounded-xl bg-alert px-4 py-2 text-sm font-medium text-white"
              >
                Yes, archive
              </button>
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className="rounded-xl border border-charcoal/15 bg-white px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="rounded-xl border border-alert px-4 py-2 text-sm text-alert-deep"
            >
              Archive project
            </button>
          )}
        </section>
      )}
    </>
  );
}
