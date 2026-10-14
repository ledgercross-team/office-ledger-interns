import { Suspense, type ReactNode } from 'react';
import { HrmsShell } from '@/components/hrms/shell';

export default function HrmsAppLayout({ children }: { children: ReactNode }) {
  // The shell reads the current path, which dynamic routes must wrap in Suspense.
  return (
    <Suspense fallback={<p className="p-4 text-sm text-charcoal-soft">Loading…</p>}>
      <HrmsShell>{children}</HrmsShell>
    </Suspense>
  );
}
