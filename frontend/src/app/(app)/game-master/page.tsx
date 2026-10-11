'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { RoleGate } from '@/components/role-gate';
import { apiFetch } from '@/lib/api-client';
import { companyState } from '@/lib/company-state';
import { errorMessage, formatDate } from '@/lib/format';
import type { GameMasterCompany, Paginated } from '@/lib/types';

function Companies() {
  const query = useQuery({
    queryKey: ['companies', 'list'],
    queryFn: () => apiFetch<Paginated<GameMasterCompany>>('/game-master/companies?pageSize=100'),
    refetchInterval: 30_000,
  });

  // Expired and expiring companies first, then by name.
  const rows = [...(query.data?.items ?? [])]
    .map((company) => ({ company, state: companyState(company) }))
    .sort(
      (a, b) =>
        a.state.priority - b.state.priority || a.company.name.localeCompare(b.company.name),
    );

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-charcoal">Companies</h1>
        <Link
          href="/game-master/companies/new"
          className="rounded-xl bg-evergreen px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-evergreen-dark"
        >
          New company
        </Link>
      </div>

      {query.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {query.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {errorMessage(query.error)}
        </p>
      )}
      {query.data && rows.length === 0 && (
        <p className="text-sm text-charcoal-soft">No companies yet.</p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-charcoal/10 bg-white shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-charcoal/10 bg-offwhite text-charcoal-soft">
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Admin</th>
                <th className="px-4 py-2.5 font-medium">State</th>
                <th className="px-4 py-2.5 font-medium">Ends</th>
                <th className="px-4 py-2.5 font-medium">Unread</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/5">
              {rows.map(({ company, state }) => (
                <tr key={company.id} className="transition-colors hover:bg-mist/50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/game-master/companies/${company.id}`}
                      className="font-medium text-evergreen hover:underline"
                    >
                      {company.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {company.adminName ?? '—'}
                    {company.adminEmail && (
                      <span className="block text-xs text-charcoal-soft">{company.adminEmail}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${state.className}`}>
                      {state.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {company.subscription ? formatDate(company.subscription.endsOn) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {company.unreadCount > 0 ? (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-alert px-1.5 text-[11px] font-semibold text-white">
                        {company.unreadCount}
                      </span>
                    ) : (
                      <span className="text-charcoal-soft">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/game-master/messages/${company.id}`}
                      className="rounded-lg border border-charcoal/15 px-2.5 py-1 text-xs font-medium text-charcoal hover:bg-mist"
                    >
                      Messages
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function GameMasterPage() {
  return (
    <RoleGate allow={['game_master']}>
      <Companies />
    </RoleGate>
  );
}
