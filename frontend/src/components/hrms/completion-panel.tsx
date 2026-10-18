'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Banner } from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsProjectDetail } from '@/lib/hrms/types';

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

const primary =
  'rounded-xl bg-evergreen px-4 py-2 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60';
const secondary =
  'rounded-xl border border-charcoal/15 px-4 py-2 text-sm hover:bg-mist/60 disabled:opacity-60';

// Plan section 5: every manager ticks, then a lead approves (CEO or COO when there is no lead).
// The database decides who may do what; this panel shows the next step and passes its message on.
export function CompletionPanel({
  project,
  onChange,
}: {
  project: HrmsProjectDetail;
  onChange: (project: HrmsProjectDetail) => void;
}) {
  const { session } = useHrmsAuth();
  const [error, setError] = useState<string | null>(null);

  const call = useMutation({
    mutationFn: (action: 'tick' | 'complete' | 'send-back' | 'reopen') =>
      hrmsFetch<HrmsProjectDetail>(`/projects/${project.id}/${action}`, { method: 'POST' }),
    onSuccess: (data) => {
      setError(null);
      onChange(data);
    },
    onError: (err) => setError(message(err)),
  });

  const { completion } = project;
  const me = project.members.find((m) => m.memberId === session?.activeMemberId);
  const isCeoOrCoo = session?.role === 'ceo' || session?.role === 'coo';
  const canApprove = project.iAmLead || (project.leadCount === 0 && isCeoOrCoo);
  const canSendBack = project.iAmLead || isCeoOrCoo;

  if (project.status === 'archived') return null;

  return (
    <section className="space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4">
      <h2 className="font-medium text-charcoal">Completion</h2>

      {project.status === 'active' && (
        <>
          <p className="text-sm text-charcoal-soft">
            When every task is Done or Cancelled, every manager ticks the project as done.{' '}
            {completion.managersTicked} of {completion.managersTotal} managers have ticked.
          </p>
          {me?.role === 'manager' && (
            <button
              type="button"
              disabled={call.isPending || me.ticked === true}
              onClick={() => call.mutate('tick')}
              className={primary}
            >
              {me.ticked ? 'You have ticked this project' : 'Tick as done'}
            </button>
          )}
        </>
      )}

      {project.status === 'pending_lead_approval' && (
        <>
          <p className="text-sm text-charcoal-soft">
            All managers have ticked. Waiting for{' '}
            {completion.approver === 'lead'
              ? 'a project lead'
              : 'the CEO or COO (no lead is tagged)'}{' '}
            to approve.
          </p>
          <div className="flex flex-wrap gap-2">
            {canApprove && (
              <button
                type="button"
                disabled={call.isPending}
                onClick={() => call.mutate('complete')}
                className={primary}
              >
                Approve completion
              </button>
            )}
            {canSendBack && (
              <button
                type="button"
                disabled={call.isPending}
                onClick={() => call.mutate('send-back')}
                className={secondary}
              >
                Send back
              </button>
            )}
          </div>
        </>
      )}

      {project.status === 'completed' && (
        <>
          <p className="text-sm text-charcoal-soft">
            Completed {project.completedAt?.slice(0, 10)}. New tasks cannot be added.
            {project.ratingClosesAt && ` Ratings close ${project.ratingClosesAt.slice(0, 10)}.`}
          </p>
          {isCeoOrCoo && (
            <button
              type="button"
              disabled={call.isPending}
              onClick={() => call.mutate('reopen')}
              className={secondary}
            >
              Reopen project
            </button>
          )}
        </>
      )}

      {error && (
        <Banner tone="danger" title="Could not update completion">
          {error}
        </Banner>
      )}
    </section>
  );
}
