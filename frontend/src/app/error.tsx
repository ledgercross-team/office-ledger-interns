'use client';

import { FullPageState } from '@/components/hrms/full-page-state';

export default function RouteError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <FullPageState kind="error" onRetry={retry} />
    </div>
  );
}
