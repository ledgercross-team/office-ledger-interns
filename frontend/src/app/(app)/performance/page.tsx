'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BreakdownDrawer, ScoreBadge } from '@/components/hrms/performance-parts';
import { RoleGate } from '@/components/hrms/role-gate';
import { hrmsFetch } from '@/lib/hrms/api-client';
import type { PerformanceRow } from '@/lib/hrms/types';

function Performance() {
  const [open, setOpen] = useState<string | null>(null);
  const data = useQuery({
    queryKey: ['hrms', 'performance'],
    queryFn: () => hrmsFetch<{ items: PerformanceRow[] }>('/performance'),
  });
  return (
    <>
      <h1 className="text-xl font-semibold text-charcoal">Performance</h1>
      {data.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {data.data && data.data.items.length === 0 && (
        <p className="text-sm text-charcoal-soft">
          Scores are computed nightly. None have been computed yet.
        </p>
      )}
      <ul className="space-y-2">
        {data.data?.items.map((r) => (
          <li
            key={r.memberId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-charcoal/10 bg-white p-3"
          >
            <button
              type="button"
              onClick={() => setOpen(r.memberId)}
              className="text-sm font-medium text-forest hover:underline"
            >
              {r.fullName}
            </button>
            <ScoreBadge row={r} />
          </li>
        ))}
      </ul>
      {open && <BreakdownDrawer memberId={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export default function PerformancePage() {
  return (
    <RoleGate allow={['ceo', 'coo', 'manager', 'employee']}>
      <Performance />
    </RoleGate>
  );
}
