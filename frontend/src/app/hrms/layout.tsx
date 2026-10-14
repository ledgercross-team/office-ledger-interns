import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { HrmsAuthProvider } from '@/lib/hrms/auth-context';

export default function HrmsLayout({ children }: { children: ReactNode }) {
  // The new screens stay hidden until the switch is on.
  if (process.env.NEXT_PUBLIC_HRMS_ENABLED !== 'true') notFound();

  return <HrmsAuthProvider>{children}</HrmsAuthProvider>;
}
