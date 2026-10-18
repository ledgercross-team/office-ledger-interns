'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/hrms/role-gate';
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  PageShell,
  Skeleton,
  cardClass,
  controlClass,
  labelClass,
  useToast,
} from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { formatDate } from '@/lib/hrms/time';
import { cn } from '@/lib/cn';
import type { RatingsDueProject } from '@/lib/hrms/types';

function ProjectRatings({ project, onDone }: { project: RatingsDueProject; onDone: () => void }) {
  const [stars, setStars] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    try {
      await hrmsFetch(`/projects/${project.projectId}/ratings`, {
        method: 'POST',
        body: {
          ratings: project.ratees.map((r) => ({
            rateeId: r.memberId,
            stars: stars[r.memberId],
            comment: String(f.get(`c-${r.memberId}`) ?? '').trim() || undefined,
          })),
        },
      });
      onDone();
    } catch (err) {
      setError(
        err instanceof HrmsApiError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setPending(false);
    }
  }

  const complete = project.ratees.every((r) => stars[r.memberId]);

  return (
    <form onSubmit={onSubmit} className={`${cardClass} max-w-lg space-y-3`}>
      <h2 className="font-medium text-fg">{project.projectName}</h2>
      <p className="text-xs text-fg-muted">
        Ratings are anonymous. Open until {project.closesAt ? formatDate(project.closesAt) : '—'}.
        One or two stars need a comment.
      </p>
      {project.ratees.map((r) => (
        <fieldset key={r.memberId} className="space-y-1">
          <legend className={labelClass}>
            {r.fullName} <span className="text-xs font-normal text-fg-muted">({r.role})</span>
          </legend>
          <div className="flex gap-1" role="radiogroup" aria-label={`Stars for ${r.fullName}`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars[r.memberId] === n}
                onClick={() => setStars((s) => ({ ...s, [r.memberId]: n }))}
                className={cn(
                  'flex size-9 items-center justify-center rounded-control border text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  stars[r.memberId] === n
                    ? 'border-primary bg-primary text-primary-fg'
                    : 'border-border bg-surface hover:bg-surface-sunken',
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <label htmlFor={`rating-comment-${r.memberId}`} className={labelClass}>
            Comment {stars[r.memberId] && stars[r.memberId] <= 2 ? '(required)' : '(optional)'}
            <input
              id={`rating-comment-${r.memberId}`}
              name={`c-${r.memberId}`}
              maxLength={2000}
              placeholder="Add context for this rating"
              required={Boolean(stars[r.memberId] && stars[r.memberId] <= 2)}
              className={controlClass}
            />
          </label>
        </fieldset>
      ))}
      {error && (
        <Banner tone="danger" title="Could not submit ratings">
          {error}
        </Banner>
      )}
      <Button type="submit" disabled={!complete} loading={pending} loadingLabel="Sending">
        Submit ratings
      </Button>
    </form>
  );
}

function Ratings() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const due = useQuery({
    queryKey: ['hrms', 'ratings-due'],
    queryFn: () => hrmsFetch<{ items: RatingsDueProject[] }>('/me/ratings-due'),
  });
  return (
    <PageShell>
      <PageHeader
        title="Ratings"
        description="Give thoughtful, anonymous feedback on recently completed projects."
      />
      {due.isLoading && (
        <div className="space-y-3" aria-label="Loading ratings">
          {[1, 2].map((item) => (
            <Skeleton key={item} className="h-64" />
          ))}
        </div>
      )}
      {due.error && (
        <ErrorState
          title="Could not load ratings"
          message={due.error instanceof Error ? due.error.message : 'Please try again.'}
          onRetry={() => void due.refetch()}
        />
      )}
      {due.data && due.data.items.length === 0 && (
        <EmptyState
          title="You are all caught up"
          description="There are no completed projects waiting for your rating."
        />
      )}
      {due.data?.items.map((p) => (
        <ProjectRatings
          key={p.projectId}
          project={p}
          onDone={() => {
            void queryClient.invalidateQueries({ queryKey: ['hrms', 'ratings-due'] });
            toast({
              title: 'Ratings submitted',
              description: 'Your feedback was recorded anonymously.',
              tone: 'success',
            });
          }}
        />
      ))}
    </PageShell>
  );
}

export default function RatingsPage() {
  return (
    <RoleGate allow={['manager', 'employee']}>
      <Ratings />
    </RoleGate>
  );
}
