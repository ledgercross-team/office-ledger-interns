import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import type { OverdueItem } from '@/lib/types';
import { StatusBadge } from './status-badge';

export function OverdueList({ items }: { items: OverdueItem[] }) {
  return (
    <section aria-label="Overdue tasks" className="space-y-2">
      <h2 className="font-semibold text-charcoal">Overdue tasks</h2>
      {items.length === 0 ? (
        <p className="text-sm text-charcoal-soft">Nothing is overdue.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-alert/25 bg-alert-tint/40 p-3 text-sm">
              <div className="min-w-0">
                <Link href={`/tasks/${item.id}`} className="font-medium text-charcoal hover:underline">
                  <span className="break-words">{item.title}</span>
                </Link>
                <p className="text-charcoal-soft">
                  {item.assigneeName} · due {formatDateTime(item.deadline)}
                </p>
              </div>
              <StatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
