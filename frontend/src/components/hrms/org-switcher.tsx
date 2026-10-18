'use client';

import { useState } from 'react';
import { Banner } from '@/components/ui';
import { HrmsApiError } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { HRMS_ROLE_LABELS } from '@/lib/hrms/types';

export function OrgSwitcher() {
  const { session, usableMemberships, switchOrg } = useHrmsAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!session || usableMemberships.length < 2) return null;

  async function onChange(memberId: string) {
    setError(null);
    setPending(true);
    try {
      await switchOrg(memberId);
    } catch (err) {
      setError(err instanceof HrmsApiError ? err.message : 'Could not switch organisation.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <label htmlFor="org-switcher" className="sr-only">
        Organisation
      </label>
      <select
        id="org-switcher"
        value={session.activeMemberId ?? ''}
        disabled={pending}
        onChange={(event) => void onChange(event.target.value)}
        className="rounded-xl border border-charcoal/15 bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-evergreen disabled:opacity-60"
      >
        {session.activeMemberId === null && (
          <option value="" disabled>
            Choose an organisation
          </option>
        )}
        {usableMemberships.map((m) => (
          <option key={m.memberId} value={m.memberId}>
            {m.orgName} ({HRMS_ROLE_LABELS[m.role]})
          </option>
        ))}
      </select>
      {error && (
        <Banner tone="danger" title="Could not switch organisation">
          {error}
        </Banner>
      )}
    </div>
  );
}
