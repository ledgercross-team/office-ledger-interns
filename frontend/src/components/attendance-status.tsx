import type { AttendanceDayStatus } from '@/lib/types';

const STYLES: Record<AttendanceDayStatus, { label: string; className: string }> = {
  present: { label: 'Present', className: 'bg-green-100 text-green-800' },
  late: { label: 'Late', className: 'bg-amber-100 text-amber-900' },
  absent: { label: 'Absent', className: 'bg-red-100 text-red-800' },
};

export function AttendanceStatus({ status }: { status: AttendanceDayStatus }) {
  const { label, className } = STYLES[status];

  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
