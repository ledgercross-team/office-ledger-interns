import type { SeatUsage } from '@/lib/hrms/types';

const LEVEL: Record<string, { bar: string; text: string; note: string }> = {
  ok: { bar: 'bg-primary', text: 'text-fg-muted', note: '' },
  '80': { bar: 'bg-warning', text: 'text-warning-fg', note: 'Over 80% of your seats are in use.' },
  '95': { bar: 'bg-warning', text: 'text-warning-fg', note: 'Over 95% of your seats are in use.' },
  '100': {
    bar: 'bg-danger',
    text: 'text-danger-fg',
    note: 'All seats are in use. New people cannot be added until a seat is freed.',
  },
};

export function SeatBar({ seats }: { seats: SeatUsage }) {
  const level = LEVEL[seats.warningLevel === null ? 'ok' : String(seats.warningLevel)];
  const percent = Math.min(100, Math.max(0, seats.percentUsed));

  return (
    <div className="space-y-1 tabular-nums" aria-label="Seat usage">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-fg">Seats</span>
        <span className={level.text}>
          {seats.seatsUsed} of {seats.seatLimit} used ({percent.toFixed(0)}%)
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Seat usage"
        aria-valuemin={0}
        aria-valuemax={seats.seatLimit}
        aria-valuenow={seats.seatsUsed}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className={`h-full ${level.bar}`} style={{ width: `${percent}%` }} />
      </div>
      {level.note && (
        <p role="status" className={`text-sm ${level.text}`}>
          {level.note}
        </p>
      )}
    </div>
  );
}
