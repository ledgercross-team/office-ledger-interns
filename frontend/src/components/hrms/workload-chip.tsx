import type { WorkloadItem, WorkloadLevel } from '@/lib/hrms/types';

const CLASS: Record<WorkloadLevel, string> = {
  green: 'bg-evergreen/10 text-forest',
  amber: 'bg-amber-100 text-amber-900',
  red: 'bg-alert-deep/10 text-alert-deep',
};

export function WorkloadChip({ workload }: { workload: WorkloadItem | undefined }) {
  if (!workload) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASS[workload.level]}`}
        title={`${workload.openTasks} open tasks, ${workload.activeProjects} active projects`}
      >
        {workload.openTasks} tasks · {workload.activeProjects} projects
      </span>
      {workload.onLeaveUntil && (
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900">
          On leave until {workload.onLeaveUntil}
        </span>
      )}
    </span>
  );
}
