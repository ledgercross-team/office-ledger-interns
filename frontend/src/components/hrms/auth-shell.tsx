import type { ReactNode } from 'react';
import { Card } from '@/components/ui';

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-bg p-4 sm:p-6">
      <Card className="w-full max-w-[480px]">
        <p className="text-lg font-semibold text-primary">office-ledger</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg sm:text-[1.75rem]">
          {title}
        </h1>
        <div className="mt-5">{children}</div>
      </Card>
    </main>
  );
}
