'use client';

import { useQuery } from '@tanstack/react-query';
import { RoleGate } from '@/components/role-gate';
import { StatTile } from '@/components/stat-tile';
import { apiFetch } from '@/lib/api-client';
import { errorMessage, formatDate } from '@/lib/format';
import type { CompanySubscription, Subscription } from '@/lib/types';

function stateOf(item: Subscription, today: string): string {
  if (item.cancelledAt) return 'Cancelled';
  if (item.endsOn < today) return 'Ended';
  if (item.startsOn > today) return 'Upcoming';
  return 'Current';
}

function SubscriptionView() {
  const query = useQuery({
    queryKey: ['subscription'],
    queryFn: () => apiFetch<CompanySubscription>('/company/subscription'),
  });

  if (query.isLoading) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }
  if (query.error || !query.data) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {errorMessage(query.error)}
      </p>
    );
  }

  const { current, daysLeft, items } = query.data;
  const today = new Date().toLocaleDateString('en-CA');
  // The API returns the latest subscription when none is current, so check it has not ended.
  const ended = current !== null && daysLeft !== null && daysLeft < 0;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Subscription</h1>

      {current ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Plan" value={current.planName} />
          <StatTile label="Starts" value={formatDate(current.startsOn)} />
          <StatTile label="Ends" value={formatDate(current.endsOn)} />
          <StatTile label="Days left" value={ended ? 'Ended' : (daysLeft ?? '—')} />
        </div>
      ) : (
        <p role="status" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
          You have no active subscription. Message the game master to renew.
        </p>
      )}

      {ended && current && (
        <p role="status" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
          Your subscription ended on {formatDate(current.endsOn)}. Message the game master to renew.
        </p>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">History</h2>
        {items.length === 0 ? (
          <p className="text-sm text-neutral-500">No subscriptions yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2 pr-4">Starts</th>
                <th className="py-2 pr-4">Ends</th>
                <th className="py-2">State</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2 pr-4">{item.planName}</td>
                  <td className="py-2 pr-4">{formatDate(item.startsOn)}</td>
                  <td className="py-2 pr-4">{formatDate(item.endsOn)}</td>
                  <td className="py-2">
                    {stateOf(item, today)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
