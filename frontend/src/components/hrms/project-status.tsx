import type { HrmsProject, ProjectStatus } from '@/lib/hrms/types';

const STATUS: Record<ProjectStatus, { label: string; style: string }> = {
  active: { label: 'Active', style: 'bg-mist text-forest' },
  pending_lead_approval: { label: 'Pending lead approval', style: 'bg-amber-tint text-amber-deep' },
  completed: { label: 'Completed', style: 'bg-evergreen text-white' },
  archived: { label: 'Archived', style: 'bg-charcoal/10 text-charcoal-soft' },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const s = STATUS[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs ${s.style}`}>{s.label}</span>;
}

export function ProjectFlags({ flags }: { flags: HrmsProject['flags'] }) {
  if (!flags.noManager && !flags.noEmployee) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.noManager && (
        <span className="rounded-full bg-alert-tint px-2 py-0.5 text-xs text-alert-deep">No manager</span>
      )}
      {flags.noEmployee && (
        <span className="rounded-full bg-alert-tint px-2 py-0.5 text-xs text-alert-deep">No employee</span>
      )}
    </span>
  );
}
