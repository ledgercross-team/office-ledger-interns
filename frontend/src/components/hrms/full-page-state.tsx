import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button, ErrorState } from '@/components/ui';

export type FullPageKind = 'blocked' | 'suspended' | 'forbidden' | 'not-found' | 'error';

const COPY: Record<FullPageKind, { title: string; message: string }> = {
  blocked: {
    title: 'This organisation is blocked',
    message: 'Contact the platform team to resolve this. Your data is kept.',
  },
  suspended: {
    title: 'This organisation is suspended',
    message: 'Only the CEO and COO can sign in while a subscription is renewed. Ask them for help.',
  },
  forbidden: {
    title: "You don't have permission to do that.",
    message: 'This page is not part of your role. Use the navigation to go somewhere you can use.',
  },
  'not-found': {
    title: "We couldn't find that page.",
    message: 'It may have moved or the link may be wrong.',
  },
  error: {
    title: 'Something went wrong.',
    message: 'Please try again. If it keeps happening, contact your administrator.',
  },
};

/**
 * Full-page states for blocked, suspended, 403, 404 and 500 (UI-SPEC §7).
 * Always has one h1 and a way back.
 */
export function FullPageState({
  kind,
  onRetry,
  actions,
  embedded = false,
}: {
  kind: FullPageKind;
  onRetry?: () => void;
  actions?: ReactNode;
  /** Inside the shell's own <main>: render a div, not a second landmark. */
  embedded?: boolean;
}) {
  const { title, message } = COPY[kind];
  const Wrapper = embedded ? 'div' : 'main';
  return (
    <Wrapper className="mx-auto w-full max-w-[768px] flex-1 space-y-4 p-4 sm:p-6">
      <h1 className="sr-only">{title}</h1>
      <ErrorState title={title} message={message} />
      <div className="flex flex-wrap gap-2">
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
        {actions ?? (
          <Button asChild variant="secondary">
            <Link href="/">Back to dashboard</Link>
          </Button>
        )}
      </div>
    </Wrapper>
  );
}
