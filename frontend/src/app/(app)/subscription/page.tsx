'use client';

import { useQuery } from '@tanstack/react-query';
import { RoleGate } from '@/components/role-gate';
import { StatTile } from '@/components/stat-tile';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, formatDate, todayIn } from '@/lib/format';
import type { CompanySubscription, Subscription } from '@/lib/types';

function stateOf(item: Subscription, today: string): string {
  if (item.cancelledAt) return 'Cancelled';
  if (item.endsOn < today) return 'Ended';
  if (item.startsOn > today) return 'Upcoming';
  return 'Current';
}

function stateClasses(state: string): string {
  if (state === 'Current') return 'bg-mist text-forest-deep';
  if (state === 'Upcoming') return 'bg-amber-tint text-amber-deep';
  if (state === 'Ended') return 'bg-alert-tint text-alert-deep';
  return 'bg-charcoal/10 text-charcoal-soft';
}

function SubscriptionView() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['subscription'],
    queryFn: () => apiFetch<CompanySubscription>('/company/subscription'),
  });

  if (query.isLoading) {
    return <p className="text-sm text-charcoal-soft">Loading…</p>;
  }
  if (query.error || !query.data) {
    return (
      <p role="alert" className="text-sm text-alert-deep">
        {errorMessage(query.error)}
      </p>
    );
  }

  const { current, daysLeft, items } = query.data;
  const historyItems = items.filter((item) => item.cancelledAt === null);
  const today = todayIn(user?.companyTimezone);
  // The API returns the latest subscription when none is current, so check it has not ended.
  const currentState = current ? stateOf(current, today) : null;
  const ended = currentState === 'Ended';
  const accessValue = currentState === 'Current' ? (daysLeft ?? '—') : currentState === 'Ended' ? 'Ended' : 'Starts soon';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-evergreen">Account billing</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-charcoal sm:text-3xl">Subscription</h1>
          <p className="mt-1 text-sm text-charcoal-soft">Plans purchased for your company through the game master.</p>
        </div>
        <p className="rounded-full border border-charcoal/10 bg-white px-3 py-1.5 text-xs font-medium text-charcoal-soft shadow-sm">
          Company plan
        </p>
      </header>

      {current ? (
        <section className="overflow-hidden rounded-3xl border border-charcoal/10 bg-white shadow-[0_8px_30px_rgba(28,43,37,0.07)]">
          <div className="flex min-w-0 flex-col gap-5 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-7">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-mist text-evergreen">
                <svg aria-hidden width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2.5" y="5" width="19" height="14" rx="2" />
                  <path d="M2.5 10h19" />
                  <path d="M6.5 15h3" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-charcoal-soft">Purchased plan</p>
                <h2 className="mt-1 break-words text-2xl font-semibold tracking-tight text-charcoal sm:text-3xl">
                  {current.planName}
                </h2>
                <p className="mt-1 text-sm text-charcoal-soft">
                  {currentState === 'Current' ? 'Your company currently has access to this plan.' : 'This is the latest plan recorded for your company.'}
                </p>
              </div>
            </div>
            <span className={`self-start rounded-full px-3 py-1.5 text-xs font-semibold ${stateClasses(currentState ?? 'Ended')}`}>
              {currentState}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-charcoal/10 bg-offwhite/60 p-4 min-[420px]:grid-cols-2 sm:grid-cols-3 sm:p-7">
            <StatTile label="Starts" value={formatDate(current.startsOn)} />
            <StatTile label="Ends" value={formatDate(current.endsOn)} />
            <StatTile label={currentState === 'Current' ? 'Days left' : 'Access'} value={accessValue} />
          </div>
        </section>
      ) : (
        <p role="status" className="rounded-xl border border-brand-amber/40 bg-amber-tint p-3 text-sm text-amber-deep">
          You have no active subscription. Message the game master to renew.
        </p>
      )}

      {ended && current && (
        <p role="status" className="rounded-xl border border-brand-amber/40 bg-amber-tint p-3 text-sm text-amber-deep">
          Your subscription ended on {formatDate(current.endsOn)}. Message the game master to renew.
        </p>
      )}

      <section className="space-y-3 rounded-2xl border border-charcoal/10 bg-white p-5 shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
        <div>
          <h2 className="font-semibold text-charcoal">Subscription history</h2>
          <p className="mt-1 text-sm text-charcoal-soft">Every active or completed plan purchased for this company.</p>
        </div>
        {historyItems.length === 0 ? (
          <p className="text-sm text-charcoal-soft">No subscriptions yet.</p>
        ) : (
          <div className="slim-scroll max-w-full overflow-x-auto">
            <table className="min-w-[32rem] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-charcoal/10 text-charcoal-soft">
                  <th className="py-2 pr-4 font-medium">Plan</th>
                  <th className="py-2 pr-4 font-medium">Starts</th>
                  <th className="py-2 pr-4 font-medium">Ends</th>
                  <th className="py-2 font-medium">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/5">
                {historyItems.map((item) => {
                  const state = stateOf(item, today);
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-mist/50">
                      <td className="py-3 pr-4 font-medium text-charcoal">{item.planName}</td>
                      <td className="py-3 pr-4">{formatDate(item.startsOn)}</td>
                      <td className="py-3 pr-4">{formatDate(item.endsOn)}</td>
                      <td className="py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${stateClasses(state)}`}>
                          {state}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <RoleGate allow={['admin']}>
      <SubscriptionView />
    </RoleGate>
  );
}
