'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { MemberSearch, type MemberOption } from '@/components/hrms/member-search';
import { Banner, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { formatDate } from '@/lib/hrms/time';
import type {
  BulkResult,
  HrmsProject,
  HrmsRequest,
  HrmsTask,
  Paginated,
  RequestStatus,
  RequestType,
} from '@/lib/hrms/types';

const TYPE_LABEL: Record<RequestType, string> = {
  create_user: 'New user',
  create_project: 'New project',
  add_to_project: 'Add to project',
  create_task: 'New task',
  assign_task: 'Assign task',
  add_and_assign: 'Add and assign',
  leave: 'Leave',
  leave_change: 'Leave change',
  attendance_correction: 'Attendance correction',
};

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  applied: 'Done',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';
const primary =
  'rounded-xl bg-evergreen px-3 py-1.5 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60';
const secondary =
  'rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm hover:bg-mist/60 disabled:opacity-60';

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

function describe(r: HrmsRequest): string {
  const who = r.requestedBy.fullName;
  const project = r.project?.name ?? 'a project';
  switch (r.type) {
    case 'create_user':
      return `${who} asks for a new ${String(r.payload.role)}: ${String(r.payload.full_name)} (${String(r.payload.email)})`;
    case 'create_project':
      return `${who} asks to start the project "${String(r.payload.name)}"`;
    case 'add_to_project':
      return `${who} asks to add ${r.subject?.fullName ?? 'someone'} to ${project}`;
    case 'create_task':
      return `${who} asks to create a task in ${project}`;
    case 'assign_task':
      return `${who} asks to assign ${r.subject?.fullName ?? 'someone'} to "${r.task?.title ?? 'a task'}"`;
    case 'add_and_assign':
      return `${who} asks to add ${r.subject?.fullName ?? 'someone'} to ${project} and assign "${r.task?.title ?? 'a task'}"`;
    default:
      return `${who}: ${TYPE_LABEL[r.type]}`;
  }
}

/** After an approval the requester performs the action with one click. */
function FollowUp({ request, onDone }: { request: HrmsRequest; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: async () => {
      if (request.type === 'add_to_project' || request.type === 'add_and_assign') {
        await hrmsFetch(`/projects/${request.project!.id}/invites`, {
          method: 'POST',
          body: { memberId: request.subject!.id, requestId: request.id },
        });
      } else if (request.type === 'assign_task') {
        await hrmsFetch(`/tasks/${request.task!.id}/assignees`, {
          method: 'POST',
          body: { memberId: request.subject!.id, requestId: request.id },
        });
      }
    },
    onSuccess: onDone,
    onError: (err) => setError(message(err)),
  });

  if (request.status !== 'approved' || !request.canCancel) return null;
  return (
    <div className="space-y-1">
      {request.type === 'create_task' && request.project && (
        <Link
          href={`/tasks/new?projectId=${request.project.id}&requestId=${request.id}`}
          className={`${primary} inline-block`}
        >
          Create the task
        </Link>
      )}
      {(request.type === 'add_to_project' || request.type === 'add_and_assign') && (
        <button
          type="button"
          disabled={act.isPending}
          onClick={() => act.mutate()}
          className={primary}
        >
          Send invite
        </button>
      )}
      {request.type === 'assign_task' && (
        <button
          type="button"
          disabled={act.isPending}
          onClick={() => act.mutate()}
          className={primary}
        >
          Assign now
        </button>
      )}
      {error && (
        <Banner tone="danger" title="Request action failed">
          {error}
        </Banner>
      )}
    </div>
  );
}

function RequestRow({
  request,
  selected,
  onSelect,
  onChanged,
}: {
  request: HrmsRequest;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onChanged: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const settle = {
    onSuccess: () => {
      setRejecting(false);
      onChanged();
    },
    onError: (err: unknown) => setError(message(err)),
  };
  const approve = useMutation({
    mutationFn: () => hrmsFetch(`/requests/${request.id}/approve`, { method: 'POST' }),
    ...settle,
  });
  const reject = useMutation({
    mutationFn: () =>
      hrmsFetch(`/requests/${request.id}/reject`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    ...settle,
  });
  const cancel = useMutation({
    mutationFn: () => hrmsFetch(`/requests/${request.id}/cancel`, { method: 'POST' }),
    ...settle,
  });

  return (
    <li className="space-y-2 rounded-2xl border border-charcoal/10 bg-white p-4">
      <div className="flex items-start gap-3">
        {request.canDecide && (
          <input
            type="checkbox"
            aria-label="Select request"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            className="mt-1"
          />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm text-charcoal">{describe(request)}</p>
          <p className="text-xs text-charcoal-soft">
            {TYPE_LABEL[request.type]} · {STATUS_LABEL[request.status]} ·{' '}
            {formatDate(request.createdAt)}
            {request.status === 'pending' && ` · expires ${formatDate(request.expiresAt)}`}
          </p>
          {request.reason && (
            <p className="text-sm text-charcoal">&ldquo;{request.reason}&rdquo;</p>
          )}
          {request.decisionReason && (
            <p className="text-sm text-charcoal">
              {request.decidedBy ? `${request.decidedBy.fullName}: ` : ''}&ldquo;
              {request.decisionReason}&rdquo;
            </p>
          )}
          {request.status === 'pending' && request.cannotDecideBecause && (
            <p className="text-xs text-charcoal-soft">
              You cannot decide this: {request.cannotDecideBecause}
            </p>
          )}
        </div>
      </div>

      {request.canDecide && !rejecting && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={approve.isPending}
            onClick={() => approve.mutate()}
            className={primary}
          >
            Approve
          </button>
          <button type="button" onClick={() => setRejecting(true)} className={secondary}>
            Reject
          </button>
        </div>
      )}
      {rejecting && (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm text-charcoal">
            Reason for rejecting (required)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className={input}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={reason.trim().length === 0 || reject.isPending}
              onClick={() => reject.mutate()}
              className={primary}
            >
              Reject request
            </button>
            <button type="button" onClick={() => setRejecting(false)} className={secondary}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <FollowUp request={request} onDone={onChanged} />
      {request.canCancel && (
        <button
          type="button"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
          className={secondary}
        >
          Withdraw
        </button>
      )}
      {error && (
        <Banner tone="danger" title="Request update failed">
          {error}
        </Banner>
      )}
    </li>
  );
}

function NewRequestForm({ role, onDone }: { role: 'coo' | 'manager'; onDone: () => void }) {
  const types: RequestType[] =
    role === 'coo'
      ? ['create_project']
      : ['create_user', 'add_to_project', 'create_task', 'assign_task', 'add_and_assign'];
  const [type, setType] = useState<RequestType>(types[0]);
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const needsProject = ['add_to_project', 'create_task', 'assign_task', 'add_and_assign'].includes(
    type,
  );
  const needsSubject = ['add_to_project', 'assign_task', 'add_and_assign'].includes(type);
  const needsTask = ['assign_task', 'add_and_assign'].includes(type);

  const projects = useQuery({
    queryKey: ['hrms', 'projects', 'request-form'],
    queryFn: () => hrmsFetch<Paginated<HrmsProject>>('/projects?status=active&pageSize=100'),
    enabled: needsProject,
  });
  const [subject, setSubject] = useState<MemberOption | null>(null);
  const tasks = useQuery({
    queryKey: ['hrms', 'tasks', 'request-form', projectId],
    queryFn: () =>
      hrmsFetch<Paginated<HrmsTask>>(`/tasks?projectId=${projectId}&open=true&pageSize=100`),
    enabled: needsTask && Boolean(projectId),
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    setError(null);
    setNote(null);
    setPending(true);
    try {
      const res = await hrmsFetch<{ merged: boolean }>('/requests', {
        method: 'POST',
        body: {
          type,
          projectId: needsProject ? projectId : undefined,
          subjectMemberId: needsSubject ? text('subject') : undefined,
          taskId: needsTask ? text('task') : undefined,
          email: type === 'create_user' ? text('email') : undefined,
          fullName: type === 'create_user' ? text('fullName') : undefined,
          role: type === 'create_user' ? text('role') : undefined,
          name: type === 'create_project' ? text('name') : undefined,
          reason: text('reason'),
        },
      });
      setNote(res.merged ? 'An identical request is already waiting.' : 'Request sent.');
      event.currentTarget.reset();
      onDone();
    } catch (err) {
      setError(message(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-lg space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4"
    >
      <h2 className="font-medium text-charcoal">New request</h2>
      <label htmlFor="request-type" className="block space-y-1 text-sm font-medium text-charcoal">
        Type
        <select
          id="request-type"
          value={type}
          onChange={(e) => setType(e.target.value as RequestType)}
          className={input}
        >
          {types.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      {type === 'create_user' && (
        <>
          <label htmlFor="request-full-name" className="block space-y-1 text-sm text-charcoal">
            Full name
            <input
              id="request-full-name"
              name="fullName"
              required
              placeholder="Full name"
              maxLength={120}
              className={input}
            />
          </label>
          <label htmlFor="request-email" className="block space-y-1 text-sm text-charcoal">
            Email
            <input
              id="request-email"
              name="email"
              type="email"
              required
              placeholder="Email"
              className={input}
            />
          </label>
          <label htmlFor="request-role" className="block space-y-1 text-sm text-charcoal">
            Role
            <select id="request-role" name="role" defaultValue="employee" className={input}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
            </select>
          </label>
        </>
      )}
      {type === 'create_project' && (
        <label htmlFor="request-project-name" className="block space-y-1 text-sm text-charcoal">
          Project name
          <input
            id="request-project-name"
            name="name"
            required
            placeholder="Project name"
            maxLength={200}
            className={input}
          />
        </label>
      )}
      {needsProject && (
        <label htmlFor="request-project" className="block space-y-1 text-sm text-charcoal">
          Project
          <select
            id="request-project"
            value={projectId}
            required
            onChange={(e) => setProjectId(e.target.value)}
            className={input}
          >
            <option value="">Choose a project</option>
            {projects.data?.items
              .filter((p) => p.myRole === 'manager')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {needsSubject && (
        <MemberSearch
          label="Person"
          name="subject"
          required
          selected={subject}
          onSelect={setSubject}
          onClear={() => setSubject(null)}
        />
      )}
      {needsTask && (
        <label htmlFor="request-task" className="block space-y-1 text-sm text-charcoal">
          Task
          <select id="request-task" name="task" required className={input}>
            <option value="">Choose a task</option>
            {tasks.data?.items.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <label htmlFor="request-reason" className="block space-y-1 text-sm text-charcoal">
        Reason <span className="text-charcoal-soft">(optional)</span>
        <textarea
          id="request-reason"
          name="reason"
          rows={2}
          maxLength={1000}
          placeholder="Add context for the reviewer"
          className={input}
        />
      </label>
      {error && (
        <Banner tone="danger" title="Could not send request">
          {error}
        </Banner>
      )}
      {note && <p className="text-sm text-forest">{note}</p>}
      <button type="submit" disabled={pending} className={primary}>
        {pending ? 'Sending…' : 'Send request'}
      </button>
    </form>
  );
}

export default function RequestsPage() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const canDecide =
    session?.role === 'ceo' || session?.role === 'coo' || session?.role === 'manager';
  const canFile = session?.role === 'coo' || session?.role === 'manager';
  const [scope, setScope] = useState<'mine' | 'decide'>(canDecide ? 'decide' : 'mine');
  const [type, setType] = useState('');
  const [projectId, setProjectId] = useState('');
  const [requester, setRequester] = useState<MemberOption | null>(null);
  const requesterId = requester?.id ?? '';
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // The page number belongs to one set of filters; any filter change starts over at page 1.
  const filterKey = `${scope}|${type}|${projectId}|${requesterId}`;
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;

  const params = new URLSearchParams({ scope, page: String(page), pageSize: '25' });
  if (type) params.set('type', type);
  if (projectId) params.set('projectId', projectId);
  if (requesterId) params.set('requesterId', requesterId);

  const list = useQuery({
    queryKey: ['hrms', 'requests', session?.activeMemberId, params.toString()],
    queryFn: () => hrmsFetch<Paginated<HrmsRequest>>(`/requests?${params.toString()}`),
    enabled: Boolean(session?.activeMemberId),
  });
  const projects = useQuery({
    queryKey: ['hrms', 'projects', 'request-filter'],
    queryFn: () => hrmsFetch<Paginated<HrmsProject>>('/projects?pageSize=100'),
    enabled: Boolean(session?.activeMemberId),
  });

  const changed = () => {
    setSelected([]);
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'requests'] });
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'members'] });
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'projects'] });
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'invites'] });
  };

  const bulk = useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      hrmsFetch<BulkResult>('/requests/bulk', {
        method: 'POST',
        body: { ids: selected, decision, reason: bulkReason.trim() || undefined },
      }),
    onSuccess: (res) => {
      const failed = res.results.filter((r) => !r.ok);
      setBulkError(failed.length ? failed.map((f) => f.error).join(' · ') : null);
      setBulkNote(`${res.results.length - failed.length} of ${res.results.length} decided.`);
      setBulkReason('');
      changed();
    },
    onError: (err) => {
      setBulkNote(null);
      setBulkError(message(err));
    },
  });

  const items = list.data?.items ?? [];
  const decidable = items.filter((r) => r.canDecide);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests"
        description={
          scope === 'decide'
            ? 'Review and decide requests assigned to you.'
            : 'Track requests you have submitted.'
        }
      />

      <div className="flex flex-wrap gap-2" role="tablist">
        {(canDecide ? (['decide', 'mine'] as const) : (['mine'] as const)).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={scope === s}
            onClick={() => {
              setScope(s);
              setSelected([]);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              scope === s ? 'bg-mist text-forest' : 'text-charcoal hover:bg-mist/60'
            }`}
          >
            {s === 'decide' ? 'To decide' : 'Mine'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={`${input} sm:w-48`}
          aria-label="Type"
        >
          <option value="">All types</option>
          {(Object.keys(TYPE_LABEL) as RequestType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={`${input} sm:w-56`}
          aria-label="Project"
        >
          <option value="">All projects</option>
          {projects.data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {scope === 'decide' && (
          <div className="sm:w-64">
            <MemberSearch
              label="Requested by"
              selected={requester}
              onSelect={setRequester}
              onClear={() => setRequester(null)}
              placeholder="Anyone: search a name"
            />
          </div>
        )}
      </div>

      {scope === 'decide' && decidable.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-charcoal/10 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() =>
                setSelected(selected.length === decidable.length ? [] : decidable.map((r) => r.id))
              }
              className={secondary}
            >
              {selected.length === decidable.length ? 'Clear selection' : 'Select all'}
            </button>
            <span className="text-charcoal-soft">{selected.length} selected</span>
            <button
              type="button"
              disabled={selected.length === 0 || bulk.isPending}
              onClick={() => bulk.mutate('approve')}
              className={primary}
            >
              Approve selected
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="Reason (required to reject)"
              className={`${input} flex-1`}
            />
            <button
              type="button"
              disabled={selected.length === 0 || bulkReason.trim().length === 0 || bulk.isPending}
              onClick={() => bulk.mutate('reject')}
              className={secondary}
            >
              Reject selected
            </button>
          </div>
          {bulkNote && (
            <Banner tone="success" title="Requests updated">
              {bulkNote}
            </Banner>
          )}
          {bulkError && (
            <Banner tone="danger" title="Some requests could not be updated">
              {bulkError}
            </Banner>
          )}
        </div>
      )}

      {list.isLoading && (
        <div className="space-y-3" aria-label="Loading requests">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-32" />
          ))}
        </div>
      )}
      {list.error && (
        <ErrorState
          title="Could not load requests"
          message={message(list.error)}
          onRetry={() => void list.refetch()}
        />
      )}
      {list.data && items.length === 0 && (
        <EmptyState
          title={scope === 'decide' ? 'Nothing to decide' : 'No requests yet'}
          description={
            scope === 'decide'
              ? 'Requests requiring your decision will appear here.'
              : 'Requests you submit will appear here so you can track their progress.'
          }
        />
      )}
      <ul className="space-y-3">
        {items.map((r) => (
          <RequestRow
            key={r.id}
            request={r}
            selected={selected.includes(r.id)}
            onSelect={(checked) =>
              setSelected((ids) => (checked ? [...ids, r.id] : ids.filter((id) => id !== r.id)))
            }
            onChanged={changed}
          />
        ))}
      </ul>
      {list.data && (
        <Pagination
          page={page}
          pageSize={list.data.pageSize}
          total={list.data.total}
          onPage={(next) => setPageState({ key: filterKey, page: next })}
        />
      )}

      {canFile && session?.role && (
        <NewRequestForm role={session.role as 'coo' | 'manager'} onDone={changed} />
      )}
    </div>
  );
}
