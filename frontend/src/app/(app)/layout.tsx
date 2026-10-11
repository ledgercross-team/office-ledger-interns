'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { NAV_BY_ROLE, ROLE_LABELS } from '@/lib/navigation';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
    } else if (user.mustChangePassword) {
      router.replace('/change-password');
    }
  }, [isLoading, user, router]);

  if (!user || user.mustChangePassword) {
    return <p className="p-4 text-sm text-neutral-500">Loading…</p>;
  }

  const subscriptionEnded = user.role === 'admin' && user.subscriptionActive === false;

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">office-ledger</span>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {user.fullName} · {ROLE_LABELS[user.role]}
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded border px-3 py-1"
          >
            Log out
          </button>
        </div>
      </header>
      <nav aria-label="Main" className="flex flex-wrap gap-4 border-b px-4 py-2 text-sm">
        {NAV_BY_ROLE[user.role].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
            className={pathname.startsWith(item.href) ? 'font-semibold underline' : ''}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {subscriptionEnded && (
        <p role="alert" className="bg-amber-100 px-4 py-2 text-sm text-amber-900">
          Your company&apos;s subscription has ended. Managers and employees cannot log in.{' '}
          <Link href="/subscription" className="underline">
            View subscription
          </Link>{' '}
          or message the game master to renew.
        </p>
      )}
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
