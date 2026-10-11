'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { MessageThread } from '@/components/message-thread';
import { RoleGate } from '@/components/role-gate';
import { ApiError, apiFetch } from '@/lib/api-client';
import type { GameMasterCompanyDetail } from '@/lib/types';

function Thread() {
  const { companyId } = useParams<{ companyId: string }>();
  const company = useQuery({
    queryKey: ['companies', 'detail', companyId],
    queryFn: () => apiFetch<GameMasterCompanyDetail>(`/game-master/companies/${companyId}`),
  });

  if (company.error instanceof ApiError && [400, 404].includes(company.error.status)) {
    notFound();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm">
        <Link href="/game-master" className="underline">
          Companies
        </Link>
        {company.data && (
          <>
            {' / '}
            <Link href={`/game-master/companies/${companyId}`} className="underline">
              {company.data.company.name}
            </Link>
          </>
        )}
      </p>
      <h1 className="text-xl font-semibold">
        Messages{company.data?.admin ? ` with ${company.data.admin.fullName}` : ''}
      </h1>
      <MessageThread companyId={companyId} />
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
