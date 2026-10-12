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
  const today = todayIn(user?.companyTimezone);
  // The API returns the latest subscription when none is current, so check it has not ended.
  const ended = current !== null && daysLeft !== null && daysLeft < 0;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-charcoal">Subscription</h1>

      {current ? (
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-4">
          <StatTile label="Plan" value={current.planName} />
          <StatTile label="Starts" value={formatDate(current.startsOn)} />
          <StatTile label="Ends" value={formatDate(current.endsOn)} />
          <StatTile label="Days left" value={ended ? 'Ended' : (daysLeft ?? '—')} />
        </div>
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
        <h2 className="font-semibold text-charcoal">History</h2>
        {items.length === 0 ? (
          <p className="text-sm text-charcoal-soft">No subscriptions yet.</p>
        ) : (
          <div className="slim-scroll overflow-x-auto">
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
              {items.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-mist/50">
                  <td className="py-2 pr-4 font-medium text-charcoal">{item.planName}</td>
                  <td className="py-2 pr-4">{formatDate(item.startsOn)}</td>
                  <td className="py-2 pr-4">{formatDate(item.endsOn)}</td>
                  <td className="py-2">
                    {stateOf(item, today)}
                  </td>
                </tr>
              ))}
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
