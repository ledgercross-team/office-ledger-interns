'use client';

import { GameMasterProfile } from '@/components/hrms/game-master-profile';
import { useHrmsAuth } from '@/lib/hrms/auth-context';

export default function PlatformProfilePage() {
  const { session } = useHrmsAuth();

  if (!session?.isGameMaster) return null;
  return <GameMasterProfile session={session} />;
}
