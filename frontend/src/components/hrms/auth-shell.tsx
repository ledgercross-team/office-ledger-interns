import type { ReactNode } from 'react';
import { Activity, ArrowUpRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { BrandLink } from './brand';

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-bg p-4 sm:p-6 lg:p-10">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-card border border-border bg-surface shadow-float lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.75fr)]">
        <section className="hidden min-h-[680px] flex-col justify-between hero-card p-10 text-fg lg:flex">
          <BrandLink href="/landing" />
          <div className="max-w-md">
            <h2 className="text-4xl font-bold leading-[1.08] tracking-[-0.04em] text-fg">
              Keep the working day moving.
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-6 text-fg-muted">
              One calm workspace for projects, tasks, attendance, leave, requests, and the people
              who keep your organisation moving.
            </p>
            <div className="mt-8 grid gap-3 text-sm">
              <div className="flex items-center gap-3 rounded-control border border-border bg-surface/70 px-3 py-3">
                <Activity aria-hidden className="size-4 text-fg-muted" />
                <span>See what needs attention at a glance.</span>
              </div>
              <div className="flex items-center gap-3 rounded-control border border-border bg-surface/70 px-3 py-3">
                <ShieldCheck aria-hidden className="size-4 text-fg-muted" />
                <span>Role-aware access follows the organisation’s rules.</span>
              </div>
            </div>
          </div>
          <p className="max-w-sm text-xs leading-5 text-fg-muted">
            Access is scoped to the organisation and role attached to your account.
          </p>
        </section>

        <section className="flex min-h-[calc(100vh-2rem)] flex-col justify-center p-6 sm:p-10 lg:min-h-[680px]">
          <div className="mx-auto w-full max-w-[420px]">
            <div className="mb-10 lg:hidden">
              <BrandLink href="/landing" />
            </div>
            <div className="mb-7">
              <h1 className="text-2xl font-bold tracking-[-0.03em] text-fg sm:text-[1.75rem]">
                {title}
              </h1>
            </div>
            {children}
            <p className="mt-8 flex items-center gap-1.5 text-xs text-fg-subtle">
              Need a closer look at the workspace?
              <Link href="/landing" className="font-medium text-primary hover:underline">
                Explore Office Ledger <ArrowUpRight aria-hidden className="inline size-3" />
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
