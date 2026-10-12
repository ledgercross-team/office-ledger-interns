'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { MessageThread } from '@/components/message-thread';
import { RoleGate } from '@/components/role-gate';
import { ApiError, apiFetch } from '@/lib/api-client';
import { errorMessage } from '@/lib/format';
import type { GameMasterCompany, GameMasterCompanyDetail, Paginated } from '@/lib/types';

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function Thread() {
  const { companyId } = useParams<{ companyId: string }>();

  const company = useQuery({
    queryKey: ['companies', 'detail', companyId],
    queryFn: () => apiFetch<GameMasterCompanyDetail>(`/game-master/companies/${companyId}`),
  });

  // Conversation list for the master pane.
  const companies = useQuery({
    queryKey: ['companies', 'list'],
    queryFn: () => apiFetch<Paginated<GameMasterCompany>>('/game-master/companies?pageSize=100'),
    refetchInterval: 30_000,
  });

  if (company.error instanceof ApiError && [400, 404].includes(company.error.status)) {
    notFound();
  }

  const adminName = company.data?.admins[0]?.fullName ?? 'Company admin';
  const rows = [...(companies.data?.items ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-charcoal-soft">
        <Link href="/game-master" className="text-evergreen hover:underline">
          Companies
        </Link>
        {company.data && (
          <>
            {' / '}
            <Link href={`/game-master/companies/${companyId}`} className="text-evergreen hover:underline">
              {company.data.company.name}
            </Link>
          </>
        )}
      </p>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside
          aria-label="Conversations"
          className="overflow-hidden rounded-2xl border border-charcoal/10 bg-white shadow-[0_1px_2px_rgba(28,43,37,0.06)]"
        >
          <p className="border-b border-charcoal/10 px-4 py-3 font-semibold text-charcoal">
            Conversations
          </p>
          {companies.isLoading && (
            <p className="px-4 py-3 text-sm text-charcoal-soft">Loading…</p>
          )}
          {companies.error && (
            <p role="alert" className="px-4 py-3 text-sm text-alert-deep">
              {errorMessage(companies.error)}
            </p>
          )}
          <ul className="slim-scroll max-h-72 divide-y divide-charcoal/5 overflow-y-auto lg:max-h-none">
            {rows.map((row) => {
              const active = row.id === companyId;
              return (
                <li key={row.id}>
                  <Link
                    href={`/game-master/messages/${row.id}`}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                      active ? 'bg-mist' : 'hover:bg-offwhite'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        active ? 'bg-forest text-white' : 'bg-mist text-forest'
                      }`}
                    >
                      {initials(row.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-charcoal">{row.name}</span>
                      <span className="block truncate text-xs text-charcoal-soft">
                        {row.adminName ?? 'No admin yet'}
                      </span>
                    </span>
                    {row.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-alert px-1.5 text-[11px] font-semibold text-white">
                        {row.unreadCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>

        <MessageThread
          companyId={companyId}
          title={adminName}
          subtitle={company.data?.company.name}
          className="h-[calc(100dvh-19rem)]"
        />
      </div>
    </div>
  );
}

export default function GameMasterMessagesPage() {
  return (
    <RoleGate allow={['game_master']}>
      <Thread />
    </RoleGate>
  );
}
