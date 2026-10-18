import Link from 'next/link';
import { Button, EmptyState } from '@/components/ui';
import { AuthShell } from '@/components/hrms/auth-shell';

/**
 * Password resets are not self-serve: the API has no reset endpoint.
 * People are pointed at whoever can help (API gap, UI-SPEC §7).
 */
export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot your password?">
      <EmptyState
        title="Ask your CEO or COO for a reset"
        description="Passwords cannot be reset by email. Your CEO or COO can arrange a reset link for you, and a gameMaster can recover a CEO account."
        action={
          <Button asChild variant="secondary">
            <Link href="/login">Back to log in</Link>
          </Button>
        }
      />
    </AuthShell>
  );
}
