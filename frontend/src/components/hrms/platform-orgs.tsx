'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Building2, Eye, MoreHorizontal, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  DataTable,
  Dialog,
  Drawer,
  DropdownMenu,
  Input,
  ProgressBar,
  Select,
  StatTile,
  Textarea,
  useToast,
  type DataColumn,
} from '@/components/ui';
import { hrmsFetch } from '@/lib/hrms/api-client';
import type { SemanticTone } from '@/lib/hrms/status-vocabulary';
import type { OrgStatus, PlatformOrg, PlatformRequest } from '@/lib/hrms/types';
import { CeoPanel, message } from './platform-parts';

const STATUS: Record<OrgStatus, { label: string; tone: SemanticTone }> = {
  active: { label: 'Active', tone: 'success' },
  grace: { label: 'Grace period', tone: 'warning' },
  read_only: { label: 'Read only', tone: 'warning' },
  suspended: { label: 'Suspended', tone: 'danger' },
  blocked: { label: 'Blocked', tone: 'danger' },
};

const REQUEST_LABEL: Record<PlatformRequest['type'], string> = {
  ceo_recovery: 'CEO recovery',
  remove_last_ceo: 'Replace last CEO',
};

function StatusBadge({ status }: { status: OrgStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function seatShare(org: PlatformOrg): number {
  return org.seatLimit > 0 ? org.seatsUsed / org.seatLimit : 0;
}

type Call = { method: 'POST' | 'PATCH'; path: string; body?: unknown };

/** One mutation for every org action; the caller decides what a success means. */
function useOrgCall(onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (calls: Call[]) =>
      calls.reduce<Promise<unknown>>(
        (chain, c) => chain.then(() => hrmsFetch(c.path, { method: c.method, body: c.body ?? {} })),
        Promise.resolve(),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'platform'] });
      onDone();
    },
  });
}

function CreateOrgDialog({
  open,
  onOpenChange,
  plans,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: string[];
}) {
  const toast = useToast();
  const create = useOrgCall(() => onOpenChange(false));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const name = String(f.get('name')).trim();
    create.mutate(
      [
        {
          method: 'POST',
          path: '/platform/orgs',
          body: {
            name,
            planCode: String(f.get('plan')),
            ceoEmail: String(f.get('email')).trim(),
            ceoFullName: String(f.get('ceoName')).trim(),
          },
        },
      ],
      { onSuccess: () => toast({ title: `${name} created`, tone: 'success' }) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) create.reset();
        onOpenChange(next);
      }}
      title="New organisation"
      description="Creates the organisation and invites its first CEO."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label="Organisation name" name="name" required maxLength={120} />
        <Select label="Plan" name="plan" required>
          {plans.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Input label="CEO full name" name="ceoName" required maxLength={120} />
        <Input label="CEO email" name="email" type="email" required maxLength={254} />
        {create.error && (
          <Banner tone="danger" title="Could not create the organisation">
            {message(create.error)}
          </Banner>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} loadingLabel="Creating">
            Create organisation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditOrgDialog({
  org,
  plans,
  onClose,
}: {
  org: PlatformOrg | null;
  plans: string[];
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useOrgCall(onClose);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!org) return;
    const f = new FormData(event.currentTarget);
    const name = String(f.get('name')).trim();
    const planCode = String(f.get('plan'));
    const calls: Call[] = [];
    if (name !== org.name)
      calls.push({ method: 'PATCH', path: `/platform/orgs/${org.id}`, body: { name } });
    if (planCode !== org.planCode)
      calls.push({ method: 'POST', path: `/platform/orgs/${org.id}/plan`, body: { planCode } });
    if (calls.length === 0) return onClose();
    save.mutate(calls, {
      onSuccess: () => toast({ title: 'Organisation updated', tone: 'success' }),
    });
  }

  return (
    <Dialog
      open={org !== null}
      onOpenChange={(next) => {
        if (!next) {
          save.reset();
          onClose();
        }
      }}
      title="Edit organisation"
      description="A plan change is refused while the organisation uses more seats than the new plan allows."
    >
      {org && (
        <form key={org.id} onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Organisation name"
            name="name"
            defaultValue={org.name}
            required
            maxLength={120}
          />
          <Select label="Plan" name="plan" defaultValue={org.planCode} required>
            {plans.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          {save.error && (
            <Banner tone="danger" title="Could not save">
              {message(save.error)}
            </Banner>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} loadingLabel="Saving">
              Save changes
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function BlockOrgDialog({ org, onClose }: { org: PlatformOrg | null; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const block = useOrgCall(() => {
    setReason('');
    onClose();
  });
  return (
    <Dialog
      open={org !== null}
      onOpenChange={(next) => {
        if (!next) {
          block.reset();
          setReason('');
          onClose();
        }
      }}
      title={`Block ${org?.name ?? 'organisation'}?`}
      description="Members lose access until you unblock it. No data is deleted, and the reason is kept on record."
    >
      <div className="space-y-4">
        <Textarea
          label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={500}
          required
        />
        {block.error && (
          <Banner tone="danger" title="Could not block">
            {message(block.error)}
          </Banner>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={reason.trim().length === 0}
            loading={block.isPending}
            loadingLabel="Blocking"
            onClick={() =>
              org &&
              block.mutate(
                [
                  {
                    method: 'POST',
                    path: `/platform/orgs/${org.id}/block`,
                    body: { reason: reason.trim() },
                  },
                ],
                { onSuccess: () => toast({ title: `${org.name} blocked`, tone: 'success' }) },
              )
            }
          >
            Block organisation
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function OrgDrawer({
  org,
  onClose,
  onEdit,
  onBlock,
  onUnblock,
}: {
  org: PlatformOrg | null;
  onClose: () => void;
  onEdit: (org: PlatformOrg) => void;
  onBlock: (org: PlatformOrg) => void;
  onUnblock: (org: PlatformOrg) => void;
}) {
  return (
    <Drawer
      open={org !== null}
      onOpenChange={(next) => !next && onClose()}
      title={org?.name ?? 'Organisation'}
      description="Counts only. No organisation data is shown here."
    >
      {org && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={org.status} />
            <Badge tone="neutral">{org.planCode}</Badge>
            {org.overThreshold && <Badge tone="danger">More than 25 CEOs and COOs</Badge>}
          </div>
          <ProgressBar
            label={`Seats used: ${org.seatsUsed} of ${org.seatLimit}`}
            value={org.seatsUsed}
            max={org.seatLimit || 1}
          />
          <p className="text-sm text-fg-muted">
            {org.ceoCount} CEO, {org.cooCount} COO
          </p>
          <CeoPanel orgId={org.id} orgName={org.name} />
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={() => onEdit(org)}>
              <Pencil aria-hidden className="size-4" />
              Edit
            </Button>
            {org.status === 'blocked' ? (
              <Button variant="secondary" onClick={() => onUnblock(org)}>
                <RotateCcw aria-hidden className="size-4" />
                Unblock
              </Button>
            ) : (
              <Button variant="danger" onClick={() => onBlock(org)}>
                <Ban aria-hidden className="size-4" />
                Block
              </Button>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function AttentionPanel({
  orgs,
  requests,
  onOpen,
}: {
  orgs: PlatformOrg[];
  requests: PlatformRequest[];
  onOpen: (org: PlatformOrg) => void;
}) {
  const flagged = orgs
    .map((o) => ({
      org: o,
      why:
        o.status === 'blocked'
          ? 'Blocked'
          : o.overThreshold
            ? 'More than 25 CEOs and COOs'
            : seatShare(o) >= 0.9
              ? `${o.seatsUsed}/${o.seatLimit} seats used`
              : o.status !== 'active'
                ? STATUS[o.status].label
                : null,
    }))
    .filter((x): x is { org: PlatformOrg; why: string } => x.why !== null);
  return (
    <Card className="space-y-4 lg:self-start">
      <h2 className="text-base font-semibold text-fg">Needs attention</h2>
      {flagged.length === 0 && requests.length === 0 && (
        <p className="text-sm text-fg-muted">Nothing needs a decision right now.</p>
      )}
      <ul className="space-y-2">
        {flagged.slice(0, 5).map(({ org, why }) => (
          <li key={org.id}>
            <button
              type="button"
              onClick={() => onOpen(org)}
              className="flex w-full items-center justify-between gap-3 rounded-control border border-border px-3 py-2 text-left text-sm hover:bg-surface-sunken"
            >
              <span className="min-w-0 truncate font-medium text-fg">{org.name}</span>
              <span className="shrink-0 text-xs text-fg-muted">{why}</span>
            </button>
          </li>
        ))}
        {requests.slice(0, 5).map((r) => (
          <li key={r.id}>
            <Link
              href="/platform/requests"
              className="flex items-center justify-between gap-3 rounded-control border border-border px-3 py-2 text-sm hover:bg-surface-sunken"
            >
              <span className="min-w-0 truncate font-medium text-fg">{r.orgName}</span>
              <Badge tone="warning">{REQUEST_LABEL[r.type]}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Orgs() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<PlatformOrg | null>(null);
  const [editing, setEditing] = useState<PlatformOrg | null>(null);
  const [blocking, setBlocking] = useState<PlatformOrg | null>(null);

  const orgs = useQuery({
    queryKey: ['hrms', 'platform', 'orgs'],
    queryFn: () => hrmsFetch<{ items: PlatformOrg[] }>('/platform/orgs'),
  });
  const plans = useQuery({
    queryKey: ['hrms', 'platform', 'plans'],
    queryFn: () => hrmsFetch<{ items: Array<{ code: string }> }>('/platform/plans'),
  });
  const requests = useQuery({
    queryKey: ['hrms', 'platform', 'requests'],
    queryFn: () => hrmsFetch<{ items: PlatformRequest[] }>('/platform/requests'),
  });
  const unblock = useOrgCall(() => undefined);

  const all = useMemo(() => orgs.data?.items ?? [], [orgs.data]);
  const planCodes = plans.data?.items.map((p) => p.code) ?? [];
  const pending = (requests.data?.items ?? []).filter((r) => r.status === 'pending');

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter(
      (o) => (status === 'all' || o.status === status) && o.name.toLowerCase().includes(needle),
    );
  }, [all, query, status]);

  const seatsUsed = all.reduce((n, o) => n + o.seatsUsed, 0);
  const seatsTotal = all.reduce((n, o) => n + o.seatLimit, 0);

  function doUnblock(org: PlatformOrg) {
    unblock.mutate([{ method: 'POST', path: `/platform/orgs/${org.id}/unblock` }], {
      onSuccess: () => toast({ title: `${org.name} unblocked`, tone: 'success' }),
      onError: (e) => toast({ title: 'Could not unblock', description: message(e), tone: 'error' }),
    });
    setViewing(null);
  }

  const columns: DataColumn<PlatformOrg>[] = [
    {
      id: 'name',
      header: 'Organisation',
      cell: (o) => (
        <button
          type="button"
          onClick={() => setViewing(o)}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <Avatar name={o.name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-fg">{o.name}</span>
            <span className="block text-xs text-fg-subtle">
              {o.ceoCount} CEO · {o.cooCount} COO
            </span>
          </span>
        </button>
      ),
    },
    { id: 'plan', header: 'Plan', cell: (o) => <Badge tone="neutral">{o.planCode}</Badge> },
    { id: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
    {
      id: 'seats',
      header: 'Seats',
      cell: (o) => (
        <span className="tabular-nums text-fg-muted">
          {o.seatsUsed} / {o.seatLimit}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      className: 'w-16 text-right',
      cell: (o) => (
        <DropdownMenu
          label={`Actions for ${o.name}`}
          trigger={
            <Button variant="ghost" size="sm" iconOnly aria-label={`Actions for ${o.name}`}>
              <MoreHorizontal aria-hidden className="size-4" />
            </Button>
          }
          items={[
            {
              label: 'View details',
              icon: <Eye aria-hidden className="size-4" />,
              onSelect: () => setViewing(o),
            },
            {
              label: 'Edit',
              icon: <Pencil aria-hidden className="size-4" />,
              onSelect: () => setEditing(o),
            },
            o.status === 'blocked'
              ? {
                  label: 'Unblock',
                  icon: <RotateCcw aria-hidden className="size-4" />,
                  onSelect: () => doUnblock(o),
                }
              : {
                  label: 'Block',
                  icon: <Ban aria-hidden className="size-4" />,
                  danger: true,
                  onSelect: () => setBlocking(o),
                },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <section className="hero-card space-y-5 rounded-[1.2rem] border border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-fg-muted">Platform overview</p>
            <p className="mt-1 text-4xl font-semibold tracking-[-0.03em] tabular-nums text-fg">
              {all.length}
              <span className="ml-2 text-base font-normal text-fg-muted">
                {all.length === 1 ? 'organisation' : 'organisations'}
              </span>
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              Counts only. No organisation data is shown here.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCreating(true)} disabled={planCodes.length === 0}>
              <Plus aria-hidden className="size-4" />
              New organisation
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/platform/requests">View requests</Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Organisations" value={all.length} icon={<Building2 aria-hidden />} />
          <StatTile
            label="Active"
            value={all.filter((o) => o.status === 'active').length}
            icon={<Building2 aria-hidden />}
          />
          <StatTile
            label="Blocked"
            value={all.filter((o) => o.status === 'blocked').length}
            tone={all.some((o) => o.status === 'blocked') ? 'danger' : 'default'}
            icon={<Ban aria-hidden />}
          />
          <StatTile
            label="Seats in use"
            value={`${seatsUsed} / ${seatsTotal}`}
            icon={<Building2 aria-hidden />}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 space-y-3" aria-labelledby="orgs-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="orgs-heading"
              className="flex items-center gap-2 text-base font-semibold text-fg"
            >
              Organisations
              <span className="rounded-md bg-fg px-1.5 py-0.5 text-xs font-medium text-bg tabular-nums">
                {all.length}
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative block">
                <span className="sr-only">Search organisations</span>
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search organisations"
                  className="min-h-10 w-56 rounded-control border border-border bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-fg-subtle focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </label>
              <label>
                <span className="sr-only">Filter by status</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="min-h-10 rounded-control border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                >
                  <option value="all">All statuses</option>
                  {Object.entries(STATUS).map(([value, s]) => (
                    <option key={value} value={value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <DataTable
            caption="Organisations"
            rows={shown}
            columns={columns}
            rowKey={(o) => o.id}
            loading={orgs.isLoading}
            error={orgs.error ? message(orgs.error) : undefined}
            onRetry={() => void orgs.refetch()}
            emptyTitle={all.length === 0 ? 'No organisations yet' : 'No organisations match'}
            emptyDescription={
              all.length === 0
                ? 'Create the first organisation and invite its CEO.'
                : 'Try a different search or status.'
            }
            emptyAction={
              all.length === 0 ? (
                <Button onClick={() => setCreating(true)}>New organisation</Button>
              ) : undefined
            }
          />
        </section>
        <AttentionPanel orgs={all} requests={pending} onOpen={setViewing} />
      </div>

      <CreateOrgDialog open={creating} onOpenChange={setCreating} plans={planCodes} />
      <EditOrgDialog org={editing} plans={planCodes} onClose={() => setEditing(null)} />
      <BlockOrgDialog org={blocking} onClose={() => setBlocking(null)} />
      <OrgDrawer
        org={viewing}
        onClose={() => setViewing(null)}
        onEdit={(o) => {
          setViewing(null);
          setEditing(o);
        }}
        onBlock={(o) => {
          setViewing(null);
          setBlocking(o);
        }}
        onUnblock={doUnblock}
      />
    </div>
  );
}
