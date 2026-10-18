import { StatusPill } from '@/components/ui';
import { FLAGS, PROJECT_STATUSES } from '@/lib/hrms/status-vocabulary';
import type { HrmsProject, ProjectStatus } from '@/lib/hrms/types';

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <StatusPill status={PROJECT_STATUSES[status]} />;
}

export function ProjectFlags({ flags }: { flags: HrmsProject['flags'] }) {
  if (!flags.noManager && !flags.noEmployee) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.noManager && <StatusPill status={FLAGS.no_manager} />}
      {flags.noEmployee && <StatusPill status={FLAGS.no_employee} />}
    </span>
  );
}
