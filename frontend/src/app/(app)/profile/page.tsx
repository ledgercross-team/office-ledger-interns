'use client';

import { useQuery } from '@tanstack/react-query';
import { SecurityCard } from '@/components/hrms/security-card';
import { Avatar, Card } from '@/components/ui';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { formatDate, formatDateTime } from '@/lib/hrms/time';
import { HRMS_ROLE_LABELS, type HrmsMember } from '@/lib/hrms/types';

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium text-fg">{value || '—'}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { session } = useHrmsAuth();
  const member = useQuery({
    queryKey: ['hrms', 'members', session?.activeMemberId, 'me'],
    queryFn: () => hrmsFetch<HrmsMember>(`/members/${session?.activeMemberId}`),
    enabled: Boolean(session?.activeMemberId),
  });
  if (!session) return null;
  const m = member.data;
  return (
    <div className="mx-auto max-w-[768px] space-y-6">
      <h1 className="text-2xl font-bold text-fg">Profile</h1>
      <Card>
        <div className="mb-5 flex items-center gap-4">
          <Avatar name={session.user.fullName} size="lg" />
          <div>
            <p className="text-lg font-bold text-fg">{session.user.fullName}</p>
            <p className="text-sm text-fg-muted">
              {[m?.designation, session.role && HRMS_ROLE_LABELS[session.role]]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Field label="Employee ID" value={m?.employeeCode} />
          <Field label="Email" value={session.user.email} />
          <Field label="Phone" value={m?.phone} />
          <Field label="Department" value={m?.department} />
          <Field label="Role" value={session.role ? HRMS_ROLE_LABELS[session.role] : null} />
          <Field label="Organisation" value={session.org?.name} />
          <Field label="Joined" value={m ? formatDate(m.joinedAt) : null} />
          <Field
            label="Last active"
            value={m?.lastActiveAt ? formatDateTime(m.lastActiveAt) : null}
          />
          <Field label="Time zone" value={session.user.timezone} />
          <Field label="Status" value={m ? m.status[0].toUpperCase() + m.status.slice(1) : null} />
        </dl>
        {member.error && (
          <p role="alert" className="mt-4 text-sm text-danger-fg">
            Could not load all profile details.
          </p>
        )}
      </Card>
      <SecurityCard />
    </div>
  );
}
