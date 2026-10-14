import type { ProjectProgress } from '@/lib/hrms/types';

// Plan section 5: "18 of 24 tasks done · 75%", or "No tasks yet" for a project with none.
export function ProgressBar({ progress }: { progress: ProjectProgress }) {
  if (progress.percentDone === null) {
    return <p className="text-sm text-charcoal-soft">No tasks yet</p>;
  }
  const percent = Math.min(100, Math.max(0, progress.percentDone));
  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Project progress"
        className="h-2 w-full overflow-hidden rounded-full bg-charcoal/10"
      >
        <div className="h-full bg-evergreen" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm text-charcoal-soft">
        {progress.doneTasks} of {progress.countedTasks} tasks done · {percent.toFixed(0)}%
      </p>
    </div>
  );
}
