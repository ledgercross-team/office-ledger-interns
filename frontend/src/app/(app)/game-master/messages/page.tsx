'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { RoleGate } from '@/components/role-gate';
import { StatTile } from '@/components/stat-tile';
import { apiFetch } from '@/lib/api-client';
import { errorMessage } from '@/lib/format';
import type { GameMasterCompany, Paginated } from '@/lib/types';

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function GameMasterMessages() {
  const query = useQuery({
    queryKey: ['companies', 'list'],
    queryFn: () => apiFetch<Paginated<GameMasterCompany>>('/game-master/companies?pageSize=100'),
    refetchInterval: 30_000,
  });

  const companies = [...(query.data?.items ?? [])].sort(
    (a, b) => b.unreadCount - a.unreadCount || a.name.localeCompare(b.name),
  );
  const unreadTotal = companies.reduce((total, company) => total + company.unreadCount, 0);

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-charcoal">Messages</h1>
          <p className="mt-1 text-sm text-charcoal-soft">
            Open and manage every company conversation.
          </p>
        </div>
        <Link
          href="/game-master/dashboard"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-charcoal/15 px-4 py-2 text-sm font-medium text-charcoal hover:bg-mist sm:w-auto"
        >
          Back to dashboard
        </Link>
      </div>

      {query.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {errorMessage(query.error)}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <StatTile label="Conversations" value={companies.length} />
        <StatTile label="Unread messages" value={unreadTotal} tone="warning" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-charcoal/10 bg-white shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
        <div className="border-b border-charcoal/10 px-4 py-4 sm:px-5">
          <h2 className="font-semibold text-charcoal">All conversations</h2>
          <p className="mt-1 text-sm text-charcoal-soft">
            Unread conversations appear first.
          </p>
        </div>

        {query.isLoading && <p className="px-4 py-4 text-sm text-charcoal-soft">Loading…</p>}
        {!query.isLoading && !query.error && companies.length === 0 && (
          <p className="px-4 py-4 text-sm text-charcoal-soft">No companies yet.</p>
        )}
        {companies.length > 0 && (
          <ul className="divide-y divide-charcoal/10">
            {companies.map((company) => (
              <li key={company.id}>
                <Link
                  href={`/game-master/messages/${company.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-offwhite sm:px-5"
                >
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mist text-sm font-semibold text-forest"
                  >
                    {initials(company.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium text-charcoal">{company.name}</span>
                    <span className="block truncate text-sm text-charcoal-soft">
                      {company.adminName ?? 'No admin yet'}
                    </span>
                  </span>
                  {company.unreadCount > 0 && (
                    <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-alert px-2 text-xs font-semibold text-white">
                      {company.unreadCount} unread
                    </span>
                  )}
                  <span className="hidden shrink-0 rounded-lg border border-charcoal/15 px-3 py-2 text-xs font-medium text-charcoal sm:inline-flex sm:min-h-11 sm:items-center">
                    Open conversation
                  </span>
                  <span aria-hidden className="text-lg text-charcoal-soft sm:hidden">
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

export default function GameMasterMessagesPage() {
  return (
    <RoleGate allow={['game_master']}>
      <GameMasterMessages />
    </RoleGate>
  );
}
