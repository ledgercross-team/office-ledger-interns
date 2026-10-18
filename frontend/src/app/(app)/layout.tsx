import { Suspense, type ReactNode } from 'react';
import { HrmsAppChrome } from '@/components/hrms/app-chrome';
import { Skeleton } from '@/components/ui';

export default function HrmsAppLayout({ children }: { children: ReactNode }) {
  // The chrome reads the current path, which dynamic routes must wrap in Suspense.
  return (
    <Suspense
      fallback={
        <div className="space-y-3 p-4" aria-label="Loading application">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      }
    >
      <HrmsAppChrome>{children}</HrmsAppChrome>
    </Suspense>
  );
}
