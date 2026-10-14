'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/hrms/role-gate';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import type { RatingsDueProject } from '@/lib/hrms/types';

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';

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
      setError(err instanceof HrmsApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  const complete = project.ratees.every((r) => stars[r.memberId]);

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4">
      <h2 className="font-medium text-charcoal">{project.projectName}</h2>
      <p className="text-xs text-charcoal-soft">
        Ratings are anonymous. Open until {project.closesAt ? new Date(project.closesAt).toLocaleDateString() : '—'}.
        One or two stars need a comment.
      </p>
      {project.ratees.map((r) => (
        <fieldset key={r.memberId} className="space-y-1">
          <legend className="text-sm text-charcoal">
            {r.fullName} <span className="text-xs text-charcoal-soft">({r.role})</span>
          </legend>
          <div className="flex gap-1" role="radiogroup" aria-label={`Stars for ${r.fullName}`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars[r.memberId] === n}
                onClick={() => setStars((s) => ({ ...s, [r.memberId]: n }))}
                className={`h-8 w-8 rounded-lg border text-sm ${
                  stars[r.memberId] === n
                    ? 'border-evergreen bg-evergreen text-white'
                    : 'border-charcoal/15 hover:bg-mist/60'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <input
            name={`c-${r.memberId}`}
            maxLength={2000}
            placeholder={stars[r.memberId] && stars[r.memberId] <= 2 ? 'Comment (required)' : 'Comment (optional)'}
            required={Boolean(stars[r.memberId] && stars[r.memberId] <= 2)}
            className={input}
          />
        </fieldset>
      ))}
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!complete || pending}
        className="rounded-xl bg-evergreen px-4 py-2 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Submit ratings'}
      </button>
    </form>
  );
}

function Ratings() {
  const queryClient = useQueryClient();
  const due = useQuery({
    queryKey: ['hrms', 'ratings-due'],
    queryFn: () => hrmsFetch<{ items: RatingsDueProject[] }>('/me/ratings-due'),
  });
  return (
    <>
      <h1 className="text-xl font-semibold text-charcoal">Ratings</h1>
      {due.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {due.data && due.data.items.length === 0 && (
        <p className="text-sm text-charcoal-soft">No ratings are waiting for you.</p>
      )}
      {due.data?.items.map((p) => (
        <ProjectRatings
          key={p.projectId}
          project={p}
          onDone={() => void queryClient.invalidateQueries({ queryKey: ['hrms', 'ratings-due'] })}
        />
      ))}
    </>
  );
}

export default function RatingsPage() {
  return (
    <RoleGate allow={['manager', 'employee']}>
      <Ratings />
    </RoleGate>
  );
}
