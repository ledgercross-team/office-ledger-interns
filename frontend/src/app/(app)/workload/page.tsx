'use client';

import { useQuery } from '@tanstack/react-query';
import { RoleGate } from '@/components/hrms/role-gate';
import { WorkloadChip } from '@/components/hrms/workload-chip';
import { hrmsFetch } from '@/lib/hrms/api-client';
import type { WorkloadItem } from '@/lib/hrms/types';

function Workload() {
  const data = useQuery({
    queryKey: ['hrms', 'workload'],
    queryFn: () => hrmsFetch<{ items: WorkloadItem[] }>('/workload'),
  });
  return (
    <>
      <h1 className="text-xl font-semibold text-charcoal">Workload</h1>
      {data.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      <ul className="space-y-2">
        {data.data?.items.map((w) => (
          <li
            key={w.memberId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-charcoal/10 bg-white p-3"
          >
            <span className="text-sm text-charcoal">
              {w.fullName} <span className="text-xs text-charcoal-soft">({w.role})</span>
            </span>
            <WorkloadChip workload={w} />
          </li>
        ))}
      </ul>
    </>
  );
}

export default function WorkloadPage() {
  return (
    <RoleGate allow={['ceo', 'coo', 'manager']}>
      <Workload />
    </RoleGate>
  );
}
