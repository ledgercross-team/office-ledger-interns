import { Suspense, type ReactNode } from 'react';
import { HrmsAppChrome } from '@/components/hrms/app-chrome';

export default function HrmsAppLayout({ children }: { children: ReactNode }) {
  // The chrome reads the current path, which dynamic routes must wrap in Suspense.
  return (
    <Suspense fallback={<p className="p-4 text-sm text-fg-muted">Loading…</p>}>
      <HrmsAppChrome>{children}</HrmsAppChrome>
    </Suspense>
  );
}
