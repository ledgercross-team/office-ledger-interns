import type { AttendanceDayStatus } from '@/lib/types';

const STYLES: Record<AttendanceDayStatus, { label: string; className: string }> = {
  present: { label: 'Present', className: 'bg-mist text-forest' },
  late: { label: 'Late', className: 'bg-amber-tint text-amber-deep' },
  absent: { label: 'Absent', className: 'bg-alert-tint text-alert-deep' },
};

export function AttendanceStatus({ status }: { status: AttendanceDayStatus }) {
  const { label, className } = STYLES[status];

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
