import { daysBetween } from '../../common/utils/dates';

export interface SubscriptionDates {
  startsOn: string;
  endsOn: string;
  cancelledAt: Date | null;
}

// The current subscription if there is one, otherwise the latest non-cancelled one.
export function pickSubscription<T extends SubscriptionDates>(rows: T[], today: string): T | null {
  const live = rows.filter((row) => row.cancelledAt === null);
  const current = live.find((row) => row.startsOn <= today && row.endsOn >= today);
  if (current) {
    return current;
  }
  return live.reduce<T | null>(
    (latest, row) => (!latest || row.endsOn > latest.endsOn ? row : latest),
    null,
  );
}

/** Days from today to the end date; negative once it has ended. */
export function daysLeft(subscription: SubscriptionDates | null, today: string): number | null {
  return subscription ? daysBetween(today, subscription.endsOn) : null;
}
