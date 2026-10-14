'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { SeatBar } from '@/components/hrms/seat-bar';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { HRMS_ROLE_LABELS, type HrmsOrg } from '@/lib/hrms/types';

export default function HrmsHomePage() {
  const { session, usableMemberships, switchOrg } = useHrmsAuth();
  const canSeeSeats = session?.role === 'ceo' || session?.role === 'coo';

  const org = useQuery({
    queryKey: ['hrms', 'org', session?.activeMemberId],
    queryFn: () => hrmsFetch<HrmsOrg>('/org'),
    enabled: Boolean(session?.org),
  });

  if (!session) return null;
  const unusable = session.memberships.filter((m) => !m.usable);

  return (
    <>
      <section>
        <p className="text-sm text-charcoal-soft">Signed in as</p>
        <h1 className="text-xl font-semibold text-charcoal">{session.user.fullName}</h1>
        <p className="text-sm text-charcoal-soft">{session.user.email}</p>
        <Link
          href="/change-password"
          className="text-sm text-evergreen underline-offset-2 hover:underline"
        >
          Change password
        </Link>
      </section>

      {session.org && session.role && (
        <section className="space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4">
          <div>
            <p className="text-sm text-charcoal-soft">Active organisation</p>
            <p className="text-lg font-semibold text-forest">{session.org.name}</p>
            <p className="text-sm text-charcoal">{HRMS_ROLE_LABELS[session.role]}</p>
          </div>
          {session.org.status !== 'active' && (
            <p role="status" className="text-sm text-amber-deep">
              This organisation is {session.org.status.replace('_', ' ')}.
            </p>
          )}
          {canSeeSeats && org.data?.seats && <SeatBar seats={org.data.seats} />}
        </section>
      )}

      {session.isGameMaster && (
        <section className="rounded-2xl border border-charcoal/10 bg-white p-4">
          <p className="text-lg font-semibold text-forest">Platform console</p>
          <p className="text-sm text-charcoal-soft">
            You are signed in as a game master. Organisation data is not available to this role.
          </p>
        </section>
      )}

      {session.needsOrgSelection && (
        <section className="space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4">
          <p className="text-lg font-semibold text-forest">Choose an organisation</p>
          <ul className="space-y-2">
            {usableMemberships.map((m) => (
              <li key={m.memberId}>
                <button
                  type="button"
                  onClick={() => void switchOrg(m.memberId)}
                  className="w-full rounded-xl border border-charcoal/15 px-3 py-2 text-left hover:border-evergreen hover:bg-mist/60"
                >
                  <span className="font-medium text-charcoal">{m.orgName}</span>
                  <span className="ml-2 text-sm text-charcoal-soft">{HRMS_ROLE_LABELS[m.role]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {unusable.length > 0 && (
        <section className="rounded-2xl border border-charcoal/10 bg-white p-4">
          <p className="text-sm font-medium text-charcoal">Not available right now</p>
          <ul className="mt-1 text-sm text-charcoal-soft">
            {unusable.map((m) => (
              <li key={m.memberId}>
                {m.orgName}:{' '}
                {m.status !== 'active' ? m.status : `organisation ${m.orgStatus.replace('_', ' ')}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
