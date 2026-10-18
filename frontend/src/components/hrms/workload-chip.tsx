import type { WorkloadItem, WorkloadLevel } from '@/lib/hrms/types';
import { Badge } from '@/components/ui';

const TONE: Record<WorkloadLevel, 'success' | 'warning' | 'danger'> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
};

export function WorkloadChip({ workload }: { workload: WorkloadItem | undefined }) {
  if (!workload) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge
        tone={TONE[workload.level]}
        title={`${workload.openTasks} open tasks, ${workload.activeProjects} active projects`}
      >
        {workload.openTasks} tasks · {workload.activeProjects} projects
      </Badge>
      {workload.onLeaveUntil && <Badge tone="info">On leave until {workload.onLeaveUntil}</Badge>}
    </span>
  );
}
