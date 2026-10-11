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
        <h1 className="text-xl font-semibold">Companies</h1>
        <Link
          href="/game-master/companies/new"
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
        >
          New company
        </Link>
      </div>

      {query.isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {query.error && (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage(query.error)}
        </p>
      )}
      {query.data && rows.length === 0 && (
        <p className="text-sm text-neutral-500">No companies yet.</p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4">Company</th>
                <th className="py-2 pr-4">Admin</th>
                <th className="py-2 pr-4">State</th>
                <th className="py-2 pr-4">Ends</th>
                <th className="py-2 pr-4">Unread</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ company, state }) => (
                <tr key={company.id} className="border-b">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/game-master/companies/${company.id}`}
                      className="font-medium hover:underline"
                    >
                      {company.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    {company.adminName ?? '—'}
                    {company.adminEmail && (
                      <span className="block text-xs text-neutral-500">{company.adminEmail}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${state.className}`}>
                      {state.label}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    {company.subscription ? formatDate(company.subscription.endsOn) : '—'}
                  </td>
                  <td className="py-2 pr-4">{company.unreadCount}</td>
                  <td className="py-2">
                    <Link
                      href={`/game-master/messages/${company.id}`}
                      className="rounded border px-2 py-1 text-xs"
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
