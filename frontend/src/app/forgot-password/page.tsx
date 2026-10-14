import Link from 'next/link';
import { Button, Card, EmptyState } from '@/components/ui';

/**
 * Password resets are not self-serve: the API has no reset endpoint.
 * People are pointed at whoever can help (API gap, UI-SPEC §7).
 */
export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-[480px]">
        <p className="text-lg font-semibold text-primary">office-ledger</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">Forgot your password?</h1>
        <div className="mt-5">
          <EmptyState
            title="Ask your CEO or COO for a reset"
            description="Passwords cannot be reset by email. Your CEO or COO can arrange a reset link for you, and a gameMaster can recover a CEO account."
            action={
              <Button asChild variant="secondary">
                <Link href="/login">Back to log in</Link>
              </Button>
            }
          />
        </div>
      </Card>
    </main>
  );
}
