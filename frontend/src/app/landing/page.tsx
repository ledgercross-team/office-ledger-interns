import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { BrandLink, BrandMark } from '@/components/hrms/brand';
import { Button } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Office Ledger · The operations desk for the working day',
  description: 'Projects, people, attendance, leave, and approvals in one shared workspace.',
};

const features = [
  {
    icon: FolderKanban,
    title: 'Work stays visible',
    description:
      'Projects and tasks give every handoff a home, an owner, and a next step people can find.',
  },
  {
    icon: CalendarCheck,
    title: 'The day stays in rhythm',
    description:
      'Attendance, leave, and calendar context sit close to the work instead of getting lost in separate tools.',
  },
  {
    icon: ClipboardCheck,
    title: 'Approvals stay accountable',
    description:
      'Requests move through clear owners and role-aware actions, so nothing waits in a black box.',
  },
  {
    icon: Users,
    title: 'People stay connected',
    description:
      'Profiles, roles, invitations, and organisation access are managed from one dependable place.',
  },
];

const workflow = [
  {
    number: '01',
    title: 'Set the organisation up',
    description:
      'A platform administrator creates the organisation and establishes the first access point.',
  },
  {
    number: '02',
    title: 'Give the right people context',
    description:
      'The CEO and team members enter through the invite flow with the role and permissions they need.',
  },
  {
    number: '03',
    title: 'Run the day together',
    description:
      'Work, people, and approvals become one shared operating picture for the whole organisation.',
  },
];

const workspaceRows = [
  { icon: ClipboardCheck, title: 'Leave request', detail: 'Needs review', tone: 'warning' },
  { icon: FolderKanban, title: 'Website relaunch', detail: 'In progress', tone: 'primary' },
  { icon: CalendarCheck, title: 'Daily check-in', detail: 'Complete', tone: 'success' },
] as const;

const previewNav = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Tasks', icon: ListChecks },
  { label: 'People', icon: Users },
];

function WorkspacePreview() {
  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="absolute -right-8 -top-8 hidden size-24 rounded-full border border-primary/35 sm:block" />
      <div className="absolute -bottom-10 -left-8 hidden size-20 rounded-full border border-white/15 sm:block" />
      <div className="relative rounded-[1.6rem] border border-white/15 bg-rail p-2 shadow-[0_28px_80px_rgb(4_26_33_/_0.35)] sm:p-3">
        <div className="overflow-hidden rounded-[1.15rem] bg-bg text-fg">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-raised px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandMark className="size-7 rounded-[0.6rem] text-[0.6rem]" />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">Your workspace</p>
                <p className="truncate text-[0.65rem] text-fg-muted">Illustrative view</p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-2 py-1 text-[0.65rem] font-semibold text-success-fg">
              <span className="size-1.5 rounded-full bg-success" />
              In rhythm
            </span>
          </div>

          <div className="grid sm:grid-cols-[8rem_minmax(0,1fr)]">
            <aside className="hidden border-r border-border bg-rail p-3 text-rail-fg sm:block">
              <p className="px-2 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-rail-fg/45">
                Workspace
              </p>
              <ul className="mt-3 space-y-1.5 text-xs">
                {previewNav.map(({ label, icon: Icon }) => (
                  <li key={label}>
                    <span
                      className={`flex items-center gap-2 rounded-control px-2.5 py-2 ${label === 'Overview' ? 'bg-surface text-fg' : 'text-rail-fg/65'}`}
                    >
                      <Icon aria-hidden className="size-3.5 shrink-0" />
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            </aside>

            <div className="min-w-0 p-4 sm:p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-primary">
                    Today
                  </p>
                  <h3 className="mt-1 text-lg font-bold tracking-[-0.03em] sm:text-xl">
                    Good morning, team.
                  </h3>
                </div>
                <Clock3 aria-hidden className="size-5 text-fg-muted" />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  ['04', 'Open requests'],
                  ['08', 'Tasks in motion'],
                  ['02', 'Needs attention'],
                ].map(([value, label]) => (
                  <div
                    key={label}
                    className="min-w-0 rounded-control border border-border bg-surface-raised p-2.5 sm:p-3"
                  >
                    <p className="text-base font-bold tabular-nums sm:text-lg">{value}</p>
                    <p className="mt-1 text-[0.58rem] leading-4 text-fg-muted sm:text-[0.65rem]">
                      {label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-control border border-border bg-surface-raised p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold">What needs your attention</p>
                    <p className="mt-1 text-[0.65rem] text-fg-muted">
                      A focused queue for the next action.
                    </p>
                  </div>
                  <ArrowUpRight aria-hidden className="size-4 shrink-0 text-primary" />
                </div>
                <ul className="mt-3 divide-y divide-border">
                  {workspaceRows.map((row) => {
                    const Icon = row.icon;
                    const tone =
                      row.tone === 'success'
                        ? 'bg-success-soft text-success-fg'
                        : row.tone === 'warning'
                          ? 'bg-warning-soft text-warning-fg'
                          : 'bg-primary-soft text-primary';
                    return (
                      <li
                        key={row.title}
                        className="flex min-w-0 items-center gap-2.5 py-2 first:pt-0 last:pb-0"
                      >
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-control ${tone}`}
                        >
                          <Icon aria-hidden className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[0.7rem] font-semibold">
                          {row.title}
                        </span>
                        <span className="shrink-0 text-[0.62rem] text-fg-muted">{row.detail}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <p className="mt-3 text-center text-[0.62rem] text-fg-subtle">
                Illustrative workspace data
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-bg text-fg">
      <section className="bg-rail text-rail-fg">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
          <nav
            className="flex min-h-20 items-center justify-between gap-4 border-b border-white/10"
            aria-label="Primary"
          >
            <BrandLink inverse />
            <div className="hidden items-center gap-7 text-sm font-medium text-rail-fg/65 md:flex">
              <Link href="#features" className="hover:text-rail-fg">
                Product
              </Link>
              <Link href="#workflow" className="hover:text-rail-fg">
                How it works
              </Link>
              <Link href="#access" className="hover:text-rail-fg">
                Access
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="hidden rounded-control px-3 py-2 text-sm font-medium text-rail-fg/70 hover:bg-white/10 hover:text-rail-fg sm:inline-flex"
              >
                Sign in
              </Link>
              <Button asChild size="sm" variant="secondary">
                <Link href="/login">
                  Open workspace <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Button>
            </div>
          </nav>

          <div className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-16 lg:py-24 xl:py-28">
            <div className="max-w-2xl">
              <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-soft">
                <span className="size-2 rounded-full bg-primary" />
                The operations desk for the working day
              </p>
              <h1 className="max-w-2xl text-[2.7rem] font-bold leading-[0.98] tracking-[-0.065em] text-rail-fg sm:text-6xl lg:text-[4.7rem]">
                Run the office from one clear operating picture.
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-rail-fg/72 sm:text-lg sm:leading-8">
                Office Ledger brings work, people, attendance, leave, and approvals into the same
                rhythm—so the next action is visible, owned, and easier to trust.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild className="min-h-12 px-5">
                  <Link href="/login">
                    Sign in to your workspace <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </Button>
                <Link
                  href="#features"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control border border-white/20 bg-white/10 px-5 text-sm font-medium text-rail-fg transition-colors hover:bg-white/15"
                >
                  See the system <ChevronDown aria-hidden className="size-4" />
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-rail-fg/55">
                <span className="inline-flex items-center gap-1.5">
                  <Check aria-hidden className="size-3.5 text-primary-soft" />
                  Work and people together
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check aria-hidden className="size-3.5 text-primary-soft" />
                  Role-aware by design
                </span>
              </div>
            </div>
            <WorkspacePreview />
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface-raised">
        <div className="mx-auto grid max-w-[1440px] divide-y divide-border px-4 sm:px-6 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-10">
          {[
            ['Work in context', 'Projects, tasks, and people share the same workspace.'],
            ['Act with confidence', 'Every request has a clear owner, status, and next step.'],
            ['Keep the day moving', 'Routine work gets a calmer path from check-in to approval.'],
          ].map(([title, description]) => (
            <div
              key={title}
              className="flex gap-3 py-5 first:md:pr-8 md:px-8 md:py-7 md:first:pl-0 md:last:pr-0"
            >
              <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
              <div>
                <p className="text-sm font-bold tracking-[-0.01em]">{title}</p>
                <p className="mt-1 text-sm leading-6 text-fg-muted">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="scroll-mt-24 border-b border-border py-20 sm:py-28">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-24">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                The Office Ledger system
              </p>
              <h2 className="mt-4 text-3xl font-bold leading-[1.05] tracking-[-0.05em] sm:text-5xl">
                The pieces of the day finally speak to each other.
              </h2>
              <p className="mt-5 text-base leading-7 text-fg-muted">
                Replace scattered handoffs with one workspace that makes the state of work and the
                people behind it easier to read.
              </p>
              <Link
                href="/login"
                className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-hover"
              >
                Explore your workspace <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                const featured = index === 0;
                return (
                  <article
                    key={feature.title}
                    className={
                      featured
                        ? 'rounded-card bg-rail p-6 text-rail-fg shadow-[0_18px_45px_rgb(15_41_49_/_0.14)] sm:col-span-2 sm:p-8'
                        : 'rounded-card border border-border bg-surface-raised p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-sm sm:p-6'
                    }
                  >
                    <span
                      className={`flex size-10 items-center justify-center rounded-control ${featured ? 'bg-primary text-primary-fg' : 'bg-primary-soft text-primary'}`}
                    >
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <h3 className="mt-5 text-lg font-bold tracking-[-0.025em]">{feature.title}</h3>
                    <p
                      className={`mt-2 max-w-xl text-sm leading-6 ${featured ? 'text-rail-fg/72' : 'text-fg-muted'}`}
                    >
                      {feature.description}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="scroll-mt-24 border-b border-border py-20 sm:py-28">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              A clear path in
            </p>
            <h2 className="mt-4 text-3xl font-bold leading-[1.05] tracking-[-0.05em] sm:text-5xl">
              From setup to a steadier working rhythm.
            </h2>
            <p className="mt-5 text-base leading-7 text-fg-muted">
              The onboarding path keeps organisation creation and access decisions behind the
              platform boundary, then gives each role a workspace that fits.
            </p>
          </div>
          <ol className="mt-12 grid gap-8 border-t border-border lg:grid-cols-3 lg:gap-0">
            {workflow.map((step, index) => (
              <li
                key={step.number}
                className="border-b border-border pt-6 lg:border-b-0 lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm font-bold text-primary">{step.number}</span>
                  {index < workflow.length - 1 && (
                    <ArrowRight aria-hidden className="hidden size-4 text-border-strong lg:block" />
                  )}
                </div>
                <h3 className="mt-8 max-w-xs text-xl font-bold leading-tight tracking-[-0.03em]">
                  {step.title}
                </h3>
                <p className="mt-3 max-w-sm text-sm leading-6 text-fg-muted">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="access" className="scroll-mt-24 bg-bg py-20 sm:py-28">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
          <div className="grid overflow-hidden rounded-[1.5rem] bg-rail text-rail-fg shadow-[0_24px_70px_rgb(4_26_33_/_0.18)] lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="p-7 sm:p-10 lg:p-14">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-soft">
                <ShieldCheck aria-hidden className="size-4" />A more dependable office
              </div>
              <h2 className="mt-5 max-w-2xl text-3xl font-bold leading-[1.05] tracking-[-0.05em] sm:text-5xl">
                Make the next step obvious.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-rail-fg/72 sm:text-base sm:leading-7">
                Sign in to work from the modules and organisation permissions attached to your
                account. If your company needs a workspace, ask your platform administrator to set
                it up.
              </p>
            </div>
            <div className="border-t border-white/10 p-7 sm:p-10 lg:border-l lg:border-t-0 lg:p-14">
              <Button asChild variant="secondary" className="w-full sm:w-auto">
                <Link href="/login">
                  Go to sign in <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-surface-raised">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-8 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <div className="flex items-center gap-2">
            <BrandMark className="size-7 rounded-[0.6rem] text-[0.65rem]" />
            <span className="font-semibold text-fg">Office Ledger</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="#features" className="hover:text-fg">
              Product
            </Link>
            <Link href="#workflow" className="hover:text-fg">
              How it works
            </Link>
            <Link href="/login" className="hover:text-fg">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
