'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { RoleGate } from '@/components/role-gate';
import { useAuth } from '@/lib/auth-context';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user?.role === 'game_master') router.replace('/game-master');
  }, [user, router]);

  return (
    <RoleGate allow={['admin', 'manager', 'employee']}>
      <h1 className="text-xl font-semibold">Dashboard</h1>
    </RoleGate>
  );
}
