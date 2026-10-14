'use client';

import { SecurityCard } from '@/components/hrms/security-card';
import { Card } from '@/components/ui';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { HRMS_ROLE_LABELS } from '@/lib/hrms/types';

export default function ProfilePage() {
  const { session } = useHrmsAuth();
  if (!session) return null;
  return (
    <div className="mx-auto max-w-[768px] space-y-6">
      <h1 className="text-2xl font-semibold text-fg">Profile</h1>
      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-fg-muted">Name</dt>
            <dd className="font-medium text-fg">{session.user.fullName}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Email</dt>
            <dd className="font-medium text-fg">{session.user.email}</dd>
          </div>
          {session.role && (
            <div>
              <dt className="text-fg-muted">Role</dt>
              <dd className="font-medium text-fg">{HRMS_ROLE_LABELS[session.role]}</dd>
            </div>
          )}
          {session.org && (
            <div>
              <dt className="text-fg-muted">Organisation</dt>
              <dd className="font-medium text-fg">{session.org.name}</dd>
            </div>
          )}
        </dl>
      </Card>
      <SecurityCard />
    </div>
  );
}
