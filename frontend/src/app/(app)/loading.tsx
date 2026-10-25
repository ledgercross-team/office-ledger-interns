import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="space-y-6 p-4 sm:p-7 lg:p-10" aria-label="Loading page">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
