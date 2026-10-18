'use client';

import { useQuery } from '@tanstack/react-query';
import { RoleGate } from '@/components/hrms/role-gate';
import { WorkloadChip } from '@/components/hrms/workload-chip';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { hrmsFetch } from '@/lib/hrms/api-client';
import type { WorkloadItem } from '@/lib/hrms/types';

function Workload() {
  const data = useQuery({
    queryKey: ['hrms', 'workload'],
    queryFn: () => hrmsFetch<{ items: WorkloadItem[] }>('/workload'),
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Workload"
        description="See who is busy, overloaded, or ready for more work across the organisation."
      />
      {data.isLoading && (
        <div className="space-y-2" aria-label="Loading workload">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-16" />
          ))}
        </div>
      )}
      {data.error && (
        <ErrorState
          title="Could not load workload"
          message={(data.error as Error).message}
          onRetry={() => void data.refetch()}
        />
      )}
      {data.data && data.data.items.length === 0 && (
        <EmptyState
          title="No workload data yet"
          description="Active tasks and projects will appear here when people have work assigned."
        />
      )}
      {data.data && data.data.items.length > 0 && (
        <ul className="space-y-2">
          {data.data.items.map((w) => (
            <li
              key={w.memberId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface p-4"
            >
              <span className="text-sm text-fg">
                {w.fullName} <span className="text-xs text-fg-muted">({w.role})</span>
              </span>
              <WorkloadChip workload={w} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function WorkloadPage() {
  return (
    <RoleGate allow={['ceo', 'coo', 'manager']}>
      <Workload />
    </RoleGate>
  );
}
