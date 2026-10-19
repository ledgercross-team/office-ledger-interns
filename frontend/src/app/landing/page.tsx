import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  ClipboardCheck,
  FolderKanban,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { BrandLink, BrandMark } from '@/components/hrms/brand';
import { Button } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Office Ledger · Office operations, in one place',
  description: 'Projects, people, attendance, leave, and approvals in one shared workspace.',
};

const features = [
  {
    icon: FolderKanban,
    title: 'Projects and tasks',
    description: 'Keep delivery work visible from the project view to the tasks people own.',
  },
  {
    icon: CalendarCheck,
    title: 'Attendance and leave',
    description: 'Make the daily check-in, leave balance, and time away easy to understand.',
  },
  {
    icon: ClipboardCheck,
    title: 'Requests and approvals',
    description: 'Give each request a clear owner, status, and next step based on role.',
  },
  {
    icon: BarChart3,
    title: 'Performance signals',
    description: 'Bring ratings, attendance, leave, and task signals into one scorecard.',
  },
  {
    icon: Users,
    title: 'People and access',
    description: 'Manage people, invitations, roles, and organisation access in one place.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-aware by design',
    description:
      'The workspace shows people the work they can act on while the API enforces access.',
  },
];

const workflow = [
  {
    number: '01',
    title: 'Your platform administrator sets up the organisation',
    description:
      'The current workflow creates an organisation from the protected platform console.',
  },
  {
    number: '02',
    title: 'The CEO receives an invite',
    description:
      'The CEO sets a password through the existing invite flow, then signs in securely.',
  },
  {
    number: '03',
    title: 'The team runs the day in one workspace',
    description: 'People work from the modules and approvals available to their organisation role.',
  },
];

function WorkspacePreview() {
  return (
    <div
      aria-label="Illustrative Office Ledger workspace preview"
      className="relative rounded-[1.35rem] border border-white/15 bg-rail p-3 shadow-[0_24px_70px_rgb(4_26_33_/_0.3)]"
    >
      <div className="rounded-[1rem] border border-border bg-bg p-3 text-fg shadow-float sm:p-4">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <BrandMark className="size-7 rounded-[0.6rem] text-[0.65rem]" />
            <div>
              <p className="text-xs font-bold">Today</p>
              <p className="text-[0.65rem] text-fg-muted">Workspace overview</p>
            </div>
          </div>
          <span className="rounded-full bg-success-soft px-2 py-1 text-[0.65rem] font-medium text-success-fg">
            On track
          </span>
        </div>
        <div className="grid gap-2 py-3 sm:grid-cols-3">
          {[
            ['Requests', 'Review queue'],
            ['Attendance', 'Daily check-in'],
            ['Tasks', 'Work in motion'],
          ].map(([label, detail]) => (
            <div key={label} className="rounded-control border border-border bg-surface p-3">
              <p className="text-[0.65rem] font-medium text-fg-muted">{label}</p>
              <p className="mt-2 text-sm font-bold tracking-tight">—</p>
              <p className="mt-1 text-[0.65rem] text-fg-subtle">{detail}</p>
            </div>
          ))}
        </div>
        <div className="rounded-control border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold">Work at a glance</p>
              <p className="mt-1 text-[0.65rem] text-fg-muted">
                Projects, people, and approvals stay connected.
              </p>
            </div>
            <ArrowRight aria-hidden className="size-4 text-primary" />
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full w-2/3 rounded-full bg-primary" />
          </div>
        </div>
      </div>
      <p className="px-2 pt-3 text-center text-xs text-rail-fg/65">
        Illustrative workspace preview
      </p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-bg text-fg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav className="flex min-h-20 items-center justify-between gap-4" aria-label="Primary">
          <BrandLink />
          <div className="hidden items-center gap-7 text-sm font-medium text-fg-muted md:flex">
            <Link href="#features" className="transition-colors hover:text-fg">
              Features
            </Link>
            <Link href="#workflow" className="transition-colors hover:text-fg">
              How it works
            </Link>
            <Link href="#access" className="transition-colors hover:text-fg">
              Access
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-control px-3 py-2 text-sm font-medium text-fg-muted hover:bg-surface-sunken hover:text-fg sm:inline-flex"
            >
              Sign in
            </Link>
            <Button asChild size="sm">
              <Link href="/login">
                Open workspace <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
          </div>
        </nav>

        <section className="grid items-center gap-12 pb-20 pt-12 sm:pb-28 sm:pt-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,0.85fr)] lg:gap-20">
          <div className="max-w-2xl">
            <h1 className="max-w-xl text-4xl font-bold leading-[1.03] tracking-[-0.055em] text-fg sm:text-6xl">
              A calmer way to run the working day.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-fg-muted sm:text-lg">
              Office Ledger brings projects, tasks, attendance, leave, people, and approvals into
              one shared workspace—so the next action is easier to see and easier to trust.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild className="min-h-12 px-5">
                <Link href="/login">
                  Sign in to your workspace <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Button>
              <Link
                href="#workflow"
                className="inline-flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface px-5 text-sm font-medium text-fg transition-colors hover:bg-surface-sunken"
              >
                See how onboarding works
              </Link>
            </div>
            <p className="mt-5 max-w-lg text-xs leading-5 text-fg-subtle">
              Company setup is currently handled by a platform administrator through the protected
              organisation workflow.
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-xl rounded-[1.75rem] bg-rail p-4 sm:p-6">
            <div
              className="absolute -right-10 -top-10 size-32 rounded-full bg-primary/15"
              aria-hidden
            />
            <WorkspacePreview />
          </div>
        </section>

        <section id="features" className="scroll-mt-24 border-t border-border py-20 sm:py-24">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
              The workday, in the same language.
            </h2>
            <p className="mt-4 text-base leading-7 text-fg-muted">
              Each module is designed to make routine work easier to scan, act on, and hand off.
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article
                  key={feature.title}
                  className="group rounded-card border border-border bg-surface p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-sm"
                >
                  <span className="flex size-10 items-center justify-center rounded-control bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-fg">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <h3 className="mt-5 text-base font-bold tracking-tight">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-fg-muted">{feature.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="workflow" className="scroll-mt-24 border-t border-border py-20 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-24">
            <div>
              <h2 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
                From setup to steady rhythm.
              </h2>
              <p className="mt-4 max-w-md text-base leading-7 text-fg-muted">
                The current onboarding path keeps organisation creation and access decisions behind
                the platform boundary.
              </p>
            </div>
            <ol className="divide-y divide-border border-y border-border">
              {workflow.map((step) => (
                <li key={step.number} className="grid gap-4 py-6 sm:grid-cols-[4rem_1fr] sm:gap-6">
                  <span className="font-mono text-sm font-bold text-primary">{step.number}</span>
                  <div>
                    <h3 className="text-lg font-bold tracking-tight">{step.title}</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-muted">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="access" className="scroll-mt-24 pb-20 sm:pb-24">
          <div className="grid gap-6 rounded-card bg-rail p-6 text-rail-fg sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-[-0.04em]">Make the next step obvious.</h2>
              <p className="mt-3 text-sm leading-6 text-rail-fg/72">
                Sign in to work from the modules and organisation permissions already attached to
                your account. If your company needs a workspace, ask your platform administrator to
                set it up.
              </p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/login">
                Go to sign in <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
          </div>
        </section>

        <footer className="flex flex-col gap-4 border-t border-border py-8 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <BrandMark className="size-7 rounded-[0.6rem] text-[0.65rem]" />
            <span className="font-semibold text-fg">Office Ledger</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="#features" className="hover:text-fg">
              Features
            </Link>
            <Link href="#workflow" className="hover:text-fg">
              How it works
            </Link>
            <Link href="/login" className="hover:text-fg">
              Sign in
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
