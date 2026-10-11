import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import type { OverdueItem } from '@/lib/types';
import { StatusBadge } from './status-badge';

export function OverdueList({ items }: { items: OverdueItem[] }) {
  return (
    <section aria-label="Overdue tasks" className="space-y-2">
      <h2 className="font-semibold">Overdue tasks</h2>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing is overdue.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
              <div>
                <Link href={`/tasks/${item.id}`} className="font-medium hover:underline">
                  {item.title}
                </Link>
                <p className="text-neutral-500">
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
