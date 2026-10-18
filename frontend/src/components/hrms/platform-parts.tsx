'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Dialog, Input, PageHeader, Select, Skeleton } from '@/components/ui';
import type { SemanticTone } from '@/lib/hrms/status-vocabulary';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { PersonManager } from '@/components/hrms/platform-people';
import type { PlatformGameMaster, PlatformOrg, PlatformRequest } from '@/lib/hrms/types';

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';
const primary =
  'rounded-xl bg-evergreen px-3 py-1.5 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60';
const secondary =
  'rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm hover:bg-mist/60 disabled:opacity-60';
const card = 'space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4';

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

function useAction(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      hrmsFetch(path, { method: 'POST', body: body ?? {} }),
    onSuccess: () => {
      setError(null);
      onDone();
    },
    onError: (e) => setError(message(e)),
  });
  return { mutation, error };
}

function Error({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="text-sm text-alert-deep">
      {text}
    </p>
  ) : null;
}

function CeoPanel({
  orgId,
  orgName,
  defaultOpen = false,
}: {
  orgId: string;
  orgName: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['hrms', 'platform', 'ceos', orgId],
    queryFn: () =>
      hrmsFetch<{
        items: Array<{ memberId: string; fullName: string; email: string; status: string }>;
      }>(`/platform/orgs/${orgId}/ceos`),
    enabled: open,
  });
  const activeCount = list.data?.items.filter((c) => c.status === 'active').length ?? 0;
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={secondary}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide CEOs' : 'Manage CEOs'}
      </button>
      {open && (
        <div className="space-y-2" aria-label={`CEOs of ${orgName}`}>
          {list.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
          {list.error && (
            <p role="alert" className="text-sm text-alert-deep">
              {message(list.error)}
            </p>
          )}
          <ul className="space-y-2">
            {list.data?.items.map((c) => (
              <li key={c.memberId} className="space-y-2 rounded-xl border border-charcoal/10 p-3">
                <p className="text-sm text-charcoal">
                  {c.fullName}{' '}
                  <span className="text-xs text-charcoal-soft">
                    {c.email} · {c.status}
                  </span>
                </p>
                {c.status !== 'deactivated' && (
                  <PersonManager
                    base={`/platform/ceos/${c.memberId}`}
                    fullName={c.fullName}
                    email={c.email}
                    canRemove={activeCount > 1}
                    onChanged={() =>
                      void queryClient.invalidateQueries({ queryKey: ['hrms', 'platform'] })
                    }
                  />
                )}
              </li>
            ))}
          </ul>
          {activeCount === 1 && (
            <p className="text-xs text-charcoal-soft">
              This is the organisation&apos;s only active CEO, so it cannot be removed here. Use a
              last-CEO removal request.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function OrgForm({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient();
  const plans = useQuery({
    queryKey: ['hrms', 'platform', 'plans'],
    queryFn: () => hrmsFetch<{ items: Array<{ code: string }> }>('/platform/plans'),
  });
  const { mutation, error } = useAction(() => {
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'platform'] });
    onCreated();
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    mutation.mutate({
      path: '/platform/orgs',
      body: {
        name: String(f.get('name')).trim(),
        planCode: String(f.get('plan')),
        ceoEmail: String(f.get('email')).trim(),
        ceoFullName: String(f.get('ceoName')).trim(),
      },
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input name="name" label="Organisation name" required />
      <Select name="plan" label="Plan" required>
        {plans.data?.items.map((p) => (
          <option key={p.code} value={p.code}>
            {p.code}
          </option>
        ))}
      </Select>
      <Input name="ceoName" label="CEO full name" required />
      <Input name="email" type="email" label="CEO email" required />
      <Error text={error} />
      <div className="flex justify-end">
        <Button type="submit" loading={mutation.isPending}>
          Create organisation
        </Button>
      </div>
    </form>
  );
}

const STATUS_TONE: Record<string, SemanticTone> = {
  active: 'success',
  grace: 'warning',
  read_only: 'warning',
  suspended: 'danger',
  blocked: 'danger',
};

export function Orgs() {
  const [adding, setAdding] = useState(false);
  const orgs = useQuery({
    queryKey: ['hrms', 'platform', 'orgs'],
    queryFn: () => hrmsFetch<{ items: PlatformOrg[] }>('/platform/orgs'),
  });
  const items = orgs.data?.items ?? [];

  return (
    <section className="space-y-4">
      <PageHeader
        title="Organisations"
        description="Counts only. No organisation data is shown here."
        primaryAction={
          <Dialog
            open={adding}
            onOpenChange={setAdding}
            title="Add organisation"
            description="Creates the organisation and invites its first CEO."
            trigger={
              <Button>
                <Plus aria-hidden className="size-4" />
                Add organisation
              </Button>
            }
          >
            <OrgForm onCreated={() => setAdding(false)} />
          </Dialog>
        }
      />
      {orgs.isLoading && <Skeleton className="h-24 w-full" />}
      {orgs.data && items.length === 0 && (
        <p className="text-sm text-fg-muted">No organisations yet.</p>
      )}
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {items.map((o) => (
          <li key={o.id}>
            <Link
              href={`/platform/orgs/${o.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-sunken/70"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-fg">{o.name}</span>
              <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status.replace('_', ' ')}</Badge>
              <span className="text-sm text-fg-muted">{o.planCode}</span>
              <span className="text-sm tabular-nums text-fg-muted">
                {o.seatsUsed}/{o.seatLimit} seats
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                Manage
                <ChevronRight aria-hidden className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OrgManage({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const orgs = useQuery({
    queryKey: ['hrms', 'platform', 'orgs'],
    queryFn: () => hrmsFetch<{ items: PlatformOrg[] }>('/platform/orgs'),
  });
  const plans = useQuery({
    queryKey: ['hrms', 'platform', 'plans'],
    queryFn: () => hrmsFetch<{ items: Array<{ code: string }> }>('/platform/plans'),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'platform'] });
  const org = orgs.data?.items.find((o) => o.id === orgId);
  const back = (
    <Link
      href="/platform"
      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
    >
      <ArrowLeft aria-hidden className="size-4" />
      All organisations
    </Link>
  );

  if (orgs.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!org) {
    return (
      <div className="space-y-3">
        {back}
        <p className="text-sm text-fg-muted">Organisation not found.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={back}
        title={org.name}
        description={`${org.planCode} plan · ${org.seatsUsed}/${org.seatLimit} seats · ${org.ceoCount} CEO, ${org.cooCount} COO`}
        secondaryActions={
          <Badge tone={STATUS_TONE[org.status] ?? 'neutral'}>{org.status.replace('_', ' ')}</Badge>
        }
      />
      {org.overThreshold && <p className="text-sm text-danger-fg">More than 25 CEOs and COOs.</p>}
      <PlanBlock
        key={org.planCode + org.status}
        org={org}
        plans={plans.data?.items.map((p) => p.code) ?? []}
        onDone={refresh}
      />
      <section className={card}>
        <h2 className="font-medium text-fg">CEOs</h2>
        <CeoPanel orgId={org.id} orgName={org.name} defaultOpen />
      </section>
    </div>
  );
}

function PlanBlock({
  org,
  plans,
  onDone,
}: {
  org: PlatformOrg;
  plans: string[];
  onDone: () => void;
}) {
  const [plan, setPlan] = useState(org.planCode);
  const [reason, setReason] = useState('');
  const { mutation, error } = useAction(onDone);
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className={card}>
        <h2 className="font-medium text-fg">Plan</h2>
        <Select label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {plans.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Button
          variant="secondary"
          disabled={plan === org.planCode}
          loading={mutation.isPending}
          onClick={() =>
            mutation.mutate({ path: `/platform/orgs/${org.id}/plan`, body: { planCode: plan } })
          }
        >
          Change plan
        </Button>
      </div>
      <div className={card}>
        <h2 className="font-medium text-fg">Access</h2>
        {org.status === 'blocked' ? (
          <Button
            variant="secondary"
            loading={mutation.isPending}
            onClick={() => mutation.mutate({ path: `/platform/orgs/${org.id}/unblock` })}
          >
            Unblock organisation
          </Button>
        ) : (
          <>
            <Input
              label="Reason to block"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              variant="danger"
              disabled={reason.trim().length === 0}
              loading={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  path: `/platform/orgs/${org.id}/block`,
                  body: { reason: reason.trim() },
                })
              }
            >
              Block organisation
            </Button>
          </>
        )}
      </div>
      <div className="md:col-span-2">
        <Error text={error} />
      </div>
    </section>
  );
}

export function Requests() {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['hrms', 'platform', 'requests'],
    queryFn: () => hrmsFetch<{ items: PlatformRequest[] }>('/platform/requests'),
  });
  const { mutation, error } = useAction(
    () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'platform'] }),
  );
  return (
    <section className="space-y-3">
      <h2 className="font-medium text-charcoal">Recovery and CEO removal</h2>
      <p className="text-xs text-charcoal-soft">
        Check the person offline before verifying. A verified recovery sends a one-time link to the
        new address.
      </p>
      {list.data && list.data.items.length === 0 && (
        <p className="text-sm text-charcoal-soft">No requests.</p>
      )}
      <ul className="space-y-2">
        {list.data?.items.map((r) => (
          <li key={r.id} className="space-y-2 rounded-2xl border border-charcoal/10 bg-white p-3">
            <p className="text-sm text-charcoal">
              {r.orgName}:{' '}
              {r.type === 'ceo_recovery'
                ? `recover CEO access to ${r.newEmail}`
                : 'replace the last CEO'}{' '}
              <span className="text-xs text-charcoal-soft">({r.status})</span>
            </p>
            <div className="flex gap-2">
              {r.status === 'pending' && (
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ path: `/platform/requests/${r.id}/verify` })}
                  className={primary}
                >
                  Verified offline
                </button>
              )}
              {r.status === 'verified' && r.type === 'remove_last_ceo' && (
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ path: `/platform/requests/${r.id}/complete` })}
                  className={primary}
                >
                  Complete removal
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Error text={error} />
    </section>
  );
}

export function GameMasters() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['hrms', 'platform', 'gms'],
    queryFn: () => hrmsFetch<{ items: PlatformGameMaster[] }>('/platform/game-masters'),
  });
  const { mutation, error } = useAction(
    () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'platform'] }),
  );

  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const email = String(f.get('email')).trim();
    mutation.mutate(
      { path: '/platform/game-masters', body: { email, fullName: String(f.get('name')).trim() } },
      {
        onSuccess: (data) => {
          form.reset();
          const password = (data as { temporaryPassword?: string } | undefined)?.temporaryPassword;
          setIssued(password ? { email, password } : null);
        },
      },
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-charcoal">GameMasters</h2>
      <ul className="space-y-2">
        {list.data?.items.map((g) => (
          <li
            key={g.userId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-charcoal/10 bg-white p-3"
          >
            <span className="text-sm text-charcoal">
              {g.fullName}{' '}
              <span className="text-xs text-charcoal-soft">
                {g.email} · {g.status.replace('_', ' ')}
              </span>
            </span>
            {g.status === 'pending_confirmation' && g.userId !== session?.user.id && (
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ path: `/platform/game-masters/${g.userId}/confirm` })
                }
                className={primary}
              >
                Confirm
              </button>
            )}
            {g.status !== 'removed' && (
              <div className="w-full">
                <PersonManager
                  base={`/platform/game-masters/${g.userId}`}
                  fullName={g.fullName}
                  email={g.email}
                  canRemove={g.userId !== session?.user.id}
                  onChanged={() =>
                    void queryClient.invalidateQueries({ queryKey: ['hrms', 'platform'] })
                  }
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {issued && (
        <div role="status" className={`${card} max-w-lg border-forest/30`}>
          <h3 className="text-sm font-medium text-charcoal">
            Temporary password for {issued.email}
          </h3>
          <p className="font-mono text-base tabular-nums text-charcoal select-all">
            {issued.password}
          </p>
          <p className="text-xs text-charcoal-soft">
            Give this to them yourself. It is shown only now. They must choose their own password
            the first time they sign in, after another gameMaster confirms them.
          </p>
          <button type="button" onClick={() => setIssued(null)} className={primary}>
            I have shared it
          </button>
        </div>
      )}
      <form onSubmit={onCreate} className={`${card} max-w-lg`}>
        <h3 className="text-sm font-medium text-charcoal">Add a gameMaster</h3>
        <p className="text-xs text-charcoal-soft">
          An active gameMaster other than them must confirm them before they can sign in.
        </p>
        <input name="name" required placeholder="Full name" className={input} />
        <input name="email" type="email" required placeholder="Email" className={input} />
        <Error text={error} />
        <button type="submit" disabled={mutation.isPending} className={primary}>
          Add
        </button>
      </form>
    </section>
  );
}
