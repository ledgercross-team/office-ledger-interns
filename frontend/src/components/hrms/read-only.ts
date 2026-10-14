'use client';

import { useHrmsAuth } from '@/lib/hrms/auth-context';

/**
 * Read-only mode (UI-SPEC §5). While the org is read-only, every mutating
 * control stays visible but disabled with this reason. The API still refuses.
 */
export function useReadOnly(): { readOnly: boolean; reason: string | null } {
  const { session } = useHrmsAuth();
  const readOnly = session?.org?.status === 'read_only';
  return {
    readOnly,
    reason: readOnly
      ? 'This organisation is read-only until the subscription is renewed. You can view but not change anything.'
      : null,
  };
}
