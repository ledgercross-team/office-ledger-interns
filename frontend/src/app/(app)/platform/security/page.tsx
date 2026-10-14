'use client';

import Link from 'next/link';
import { RoleGate } from '@/components/hrms/role-gate';
import { useHrmsAuth } from '@/lib/hrms/auth-context';

export default function PlatformSecurityPage() {
  const { session } = useHrmsAuth();
  return (
    <RoleGate allow={['gameMaster']}>
      <h1 className="text-xl font-semibold text-charcoal">Security</h1>
      <section className="space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4">
        <p className="text-sm text-charcoal">
          Signed in as {session?.user.fullName} ({session?.user.email}).
        </p>
        <Link href="/change-password" className="text-sm text-forest hover:underline">
          Change password
        </Link>
      </section>
    </RoleGate>
  );
}
