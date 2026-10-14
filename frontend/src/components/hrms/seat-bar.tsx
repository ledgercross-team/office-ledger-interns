import type { SeatUsage } from '@/lib/hrms/types';

const LEVEL_STYLE: Record<string, { bar: string; text: string; note: string }> = {
  ok: { bar: 'bg-evergreen', text: 'text-charcoal-soft', note: '' },
  '80': { bar: 'bg-brand-amber', text: 'text-amber-deep', note: 'Over 80% of your seats are in use.' },
  '95': { bar: 'bg-brand-amber', text: 'text-amber-deep', note: 'Over 95% of your seats are in use.' },
  '100': {
    bar: 'bg-alert',
    text: 'text-alert-deep',
    note: 'All seats are in use. New people cannot be added until a seat is freed.',
  },
};

export function SeatBar({ seats }: { seats: SeatUsage }) {
  const level = LEVEL_STYLE[seats.warningLevel === null ? 'ok' : String(seats.warningLevel)];
  const percent = Math.min(100, Math.max(0, seats.percentUsed));

  return (
    <div className="space-y-1" aria-label="Seat usage">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-charcoal">Seats</span>
        <span className={level.text}>
          {seats.seatsUsed} of {seats.seatLimit} used ({percent.toFixed(0)}%)
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={seats.seatLimit}
        aria-valuenow={seats.seatsUsed}
        className="h-2 w-full overflow-hidden rounded-full bg-charcoal/10"
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
