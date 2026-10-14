'use client';

import { useEffect } from 'react';
import { FullPageState } from '@/components/hrms/full-page-state';

export default function HrmsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // Kept for diagnostics; never includes secrets or tokens.
    console.error('HRMS page failed:', error.message);
  }, [error]);

  return <FullPageState kind="error" onRetry={retry} embedded />;
}
