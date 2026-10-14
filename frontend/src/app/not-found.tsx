import { FullPageState } from '@/components/hrms/full-page-state';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <FullPageState kind="not-found" />
    </div>
  );
}
