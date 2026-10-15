# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Employees and managers using the app daily in a working day: checking in, filing leave and requests, working tasks and projects. Managers, COO and CEO approve requests and review performance. Five roles: gameMaster (platform console), CEO, COO, manager, employee. One login can belong to several organisations.

## Product Purpose
office-ledger is a multi-organisation HRMS covering projects, tasks, requests and approvals, attendance, leave, calendar, ratings and performance. Success is that routine HR and work-tracking tasks are finished quickly and the approval and rating rules are trusted.

## Positioning
An all-in-one HRMS: work (projects, tasks) and people (attendance, leave, ratings, performance) live in one product instead of separate tools. Business rules are enforced in the database, not the UI, so roles and approvals cannot be bypassed.

## Operating Context
Multi-tenant SaaS: each organisation has its own members and roles; a person may switch between organisations. Daily, repeated use on desktop, with some mobile use. Authentication uses cookies with optional MFA; invites and forced password change flows exist.

## Capabilities and Constraints
- Web app (Next.js 16, React 19, Tailwind 4); API is NestJS on PostgreSQL.
- Role-gated UI; real authorization is the API's.
- English only; no i18n requirement for now.
- Existing design-system components live in `src/components/ui/`.

## Brand Commitments
- Owner/brand: **LedgerCross**, a SaaS startup. Preserve the name.
- Logo: `/home/mah1uz/Downloads/ledgercross-logo.webp` (not yet in the repo). It is a teal isometric cube built from concentric squares on each face, with corner brackets framing it, on a transparent background.
- No committed brand voice, palette or typography beyond the logo.

## Evidence on Hand
- Logo file above. No testimonials, customer names, metrics or pricing exist; do not fabricate them.

## Product Principles
- Speed on repeat tasks matters more than first-impression flair.
- Show each role only what it can act on; make approval state obvious.
- Never imply a rule the database does not enforce.
- One login, many organisations: always make the current organisation clear.
