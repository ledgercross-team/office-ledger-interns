'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { companyState } from '@/lib/company-state';
import { RoleGate } from '@/components/role-gate';
import { StatTile } from '@/components/stat-tile';
import { apiFetch } from '@/lib/api-client';
import { errorMessage, formatDate } from '@/lib/format';
import type { GameMasterCompany, Paginated } from '@/lib/types';

function GameMasterDashboard() {
  const query = useQuery({
    queryKey: ['companies', 'list'],
    queryFn: () => apiFetch<Paginated<GameMasterCompany>>('/game-master/companies?pageSize=100'),
    refetchInterval: 30_000,
  });

  const companies = [...(query.data?.items ?? [])]
    .map((company) => ({ company, state: companyState(company) }))
    .sort(
      (a, b) =>
        a.state.priority - b.state.priority || a.company.name.localeCompare(b.company.name),
    );
  const activeCompanies = companies.filter(({ state }) => state.key === 'active').length;
  const expiringCompanies = companies.filter(({ state }) => state.key === 'expiring').length;
  const expiredOrInactive = companies.filter(
    ({ state }) => state.key === 'expired' || state.key === 'inactive',
  ).length;

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-charcoal">Dashboard</h1>
        <p className="mt-1 text-sm text-charcoal-soft">
          Keep track of your companies and account status from one place.
        </p>
      </div>

      {query.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {errorMessage(query.error)}
        </p>
      )}

      {query.isLoading && <p className="text-sm text-charcoal-soft">Loading company overview…</p>}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-4">
        <StatTile label="Total companies" value={companies.length} />
        <StatTile label="Active companies" value={activeCompanies} />
        <StatTile label="Expiring soon" value={expiringCompanies} tone="warning" />
        <StatTile label="Expired / inactive" value={expiredOrInactive} tone="warning" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-charcoal/10 bg-white shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
        <div className="flex flex-col gap-3 border-b border-charcoal/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="font-semibold text-charcoal">Company overview</h2>
            <p className="mt-1 text-sm text-charcoal-soft">
              Subscription health and account status at a glance.
            </p>
          </div>
          <Link
            href="/game-master"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-charcoal/15 px-4 py-2 text-sm font-medium text-charcoal hover:bg-mist sm:w-auto"
          >
            View all companies
          </Link>
        </div>

        {!query.isLoading && !query.error && companies.length === 0 && (
          <div className="px-4 py-5 sm:px-5">
            <p className="text-sm text-charcoal-soft">
              No companies yet. Add companies from the Companies section.
            </p>
          </div>
        )}

        {companies.length > 0 && (
          <ul className="divide-y divide-charcoal/10">
            {companies.map(({ company, state }) => (
              <li key={company.id}>
                <Link
                  href={`/game-master/companies/${company.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-offwhite sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium text-charcoal">{company.name}</span>
                    <span className="block truncate text-sm text-charcoal-soft">
                      {company.adminName ?? 'No admin yet'}
                      {' · '}
                      {company.subscription
                        ? `${state.key === 'expired' ? 'Ended' : 'Ends'} ${formatDate(company.subscription.endsOn)}`
                        : 'No subscription'}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${state.className}`}>
                    {state.label}
                  </span>
                  <span aria-hidden className="text-lg text-charcoal-soft">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function GameMasterDashboardPage() {
  return (
    <RoleGate allow={['game_master']}>
      <GameMasterDashboard />
    </RoleGate>
  );
}
