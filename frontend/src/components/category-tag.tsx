import { categoryMeta } from '@/lib/task-meta';
import type { TaskCategory } from '@/lib/types';

export function CategoryTag({ category }: { category: TaskCategory }) {
  const { label, dot, chip } = categoryMeta(category);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${chip}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
