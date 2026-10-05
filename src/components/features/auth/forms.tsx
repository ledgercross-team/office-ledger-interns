import { useState, type FormEvent } from "react";
import { actions } from "astro:actions";
import { navigate } from "astro:transitions/client";
import { AlertCircle, CheckCircle2, Eye, EyeOff, MailCheck } from "lucide-react";
import { authClient, safeNext, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="bg-danger-soft text-danger-text flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="border-border bg-surface flex items-start gap-3 rounded-2xl border p-4">
      <MailCheck className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted mt-1 text-sm">{children}</p>
      </div>
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pe-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="text-muted hover:text-text absolute end-1 top-1 grid size-8 place-items-center rounded-lg"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

const fd = (e: FormEvent<HTMLFormElement>) =>
  Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;

export function SignInForm({ next, initialEmail = "" }: { next?: string | null; initialEmail?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { email = "", password = "" } = fd(e);
    setLoading(true);
    setError(null);
    const { data, error: err } = await authClient.signIn.email({ email, password, rememberMe: true });
    setLoading(false);
    if (err) {
      setError(
        err.status === 403
          ? "Please verify your email first. We've sent you a new link."
          : err.message || "Invalid email or password",
      );
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return; // plugin redirects
    window.location.href = safeNext(next);
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={error} />
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required defaultValue={initialEmail} />
      </Field>
      <Field
        label={
          <span className="flex justify-between">
            Password{" "}
            <a href="/auth/forgot" className="text-primary text-sm font-normal hover:underline">
              Forgot password?
            </a>
          </span>
        }
      >
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" loading={loading} size="lg">
        Sign in
      </Button>
      <p className="text-muted text-center text-sm">
        New here?{" "}
        <a
          href={`/auth/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="text-primary font-medium hover:underline"
        >
          Create an account
        </a>
      </p>
    </form>
  );
}

export function SignUpForm({
  next,
  requireVerification,
  initialEmail = "",
}: {
  next?: string | null;
  requireVerification: boolean;
  initialEmail?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { name = "", email = "", password = "", confirm = "" } = fd(e);
    const fe: Record<string, string> = {};
    if (name.trim().length < 2) fe.name = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(email)) fe.email = "Enter a valid email address.";
    if (password.length < 10) fe.password = "Use at least 10 characters.";
    if (password !== confirm) fe.confirm = "Passwords don't match.";
    setFieldErrors(fe);
    if (Object.keys(fe).length) return;
    setLoading(true);
    setError(null);
    const { error: err } = await authClient.signUp.email({
      name: name.trim(),
      email,
      password,
      callbackURL: "/auth/verify?done=1",
    });
    setLoading(false);
    if (err) {
      setError(err.message || "Could not create your account.");
      return;
    }
    if (requireVerification) setSent(email);
    else window.location.href = safeNext(next, "/auth/join");
  }
  if (sent)
    return (
      <Notice title="Check your inbox">
        We sent a verification link to <strong>{sent}</strong>. Open it to finish signing up.
      </Notice>
    );
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={error} />
      <Field label="Full name" error={fieldErrors.name}>
        <Input name="name" autoComplete="name" required />
      </Field>
      <Field label="Work email" error={fieldErrors.email}>
        <Input name="email" type="email" autoComplete="email" required defaultValue={initialEmail} />
      </Field>
      <Field label="Password" error={fieldErrors.password} hint="At least 10 characters.">
        <PasswordInput name="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password" error={fieldErrors.confirm}>
        <PasswordInput name="confirm" autoComplete="new-password" required />
      </Field>
      <Button type="submit" loading={loading} size="lg">
        Create account
      </Button>
      <p className="text-muted text-center text-sm">
        Already have an account?{" "}
        <a
          href={`/auth/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="text-primary font-medium hover:underline"
        >
          Sign in
        </a>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { email = "" } = fd(e);
    setLoading(true);
    await authClient.requestPasswordReset({ email, redirectTo: "/auth/reset" }).catch(() => null);
    setLoading(false);
    setSent(true); // Always the same message: never reveal whether an account exists.
  }
  if (sent)
    return (
      <Notice title="Check your inbox">
        If an account exists for that email, a reset link is on its way. It expires in 30 minutes.
      </Notice>
    );
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" loading={loading} size="lg">
        Send reset link
      </Button>
      <a href="/auth/sign-in" className="text-primary text-center text-sm hover:underline">
        Back to sign in
      </a>
    </form>
  );
}

export function ResetForm({ token, error: initialError }: { token: string | null; error?: string | null }) {
  const [error, setError] = useState<string | null>(
    initialError ? "This reset link is invalid or has expired." : null,
  );
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { password = "", confirm = "" } = fd(e);
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    if (!token) return setError("This reset link is invalid or has expired.");
    setLoading(true);
    const { error: err } = await authClient.resetPassword({ newPassword: password, token });
    setLoading(false);
    if (err) return setError("This reset link is invalid or has expired.");
    setDone(true);
  }
  if (done)
    return (
      <div className="grid gap-4">
        <div
          role="status"
          className="bg-success-soft text-success-text flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm"
        >
          <CheckCircle2 className="size-4" aria-hidden /> Password updated. Other sessions were signed out.
        </div>
        <Button asChild size="lg">
          <a href="/auth/sign-in">Sign in</a>
        </Button>
      </div>
    );
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <FormError message={error} />
      <Field label="New password" hint="At least 10 characters.">
        <PasswordInput name="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password">
        <PasswordInput name="confirm" autoComplete="new-password" required />
      </Field>
      <Button type="submit" loading={loading} size="lg" disabled={!token}>
        Update password
      </Button>
    </form>
  );
}

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  return (
    <Button
      variant="outline"
      loading={state === "sending"}
      disabled={state === "sent"}
      onClick={async () => {
        setState("sending");
        await authClient
          .sendVerificationEmail({ email, callbackURL: "/auth/verify?done=1" })
          .catch(() => null);
        setState("sent");
      }}
    >
      {state === "sent" ? "Sent. Check your inbox" : "Resend verification email"}
    </Button>
  );
}

export function TwoFactorForm({ next }: { next?: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backup, setBackup] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { code = "", trust } = fd(e);
    setLoading(true);
    setError(null);
    const res = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: code.trim(), trustDevice: trust === "on" })
      : await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, ""), trustDevice: trust === "on" });
    setLoading(false);
    if (res.error) return setError("That code didn't work. Try again.");
    window.location.href = safeNext(next);
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <FormError message={error} />
      <Field label={backup ? "Backup code" : "6-digit code from your authenticator app"}>
        <Input
          name="code"
          inputMode={backup ? "text" : "numeric"}
          autoComplete="one-time-code"
          required
          autoFocus
          maxLength={backup ? 32 : 8}
        />
      </Field>
      <label className="text-muted flex items-center gap-2 text-sm">
        <input type="checkbox" name="trust" className="size-4 accent-[var(--primary)]" /> Trust this device
        for 30 days
      </label>
      <Button type="submit" loading={loading} size="lg">
        Verify
      </Button>
      <button
        type="button"
        onClick={() => setBackup((b) => !b)}
        className="text-primary text-sm hover:underline"
      >
        {backup ? "Use authenticator code" : "Use a backup code instead"}
      </button>
    </form>
  );
}

export function JoinForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { code = "" } = fd(e);
    setLoading(true);
    setError(null);
    const { data, error: err } = await actions.workspace.join({ code });
    setLoading(false);
    if (err) return setError(err.message);
    await navigate(data.status === "active" ? "/app" : "/auth/pending");
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <FormError message={error} />
      <Field
        label="Invite code"
        hint="Share this code with employees to request access. Ask your manager for it."
      >
        <Input
          name="code"
          placeholder="e.g. LEDGER-7Q4K"
          autoComplete="off"
          autoCapitalize="characters"
          required
          className="font-mono tracking-wider uppercase"
        />
      </Field>
      <Button type="submit" loading={loading} size="lg">
        Request access
      </Button>
    </form>
  );
}

export function AcceptInvite({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <div className="grid gap-3">
      <FormError message={error} />
      <Button
        size="lg"
        loading={loading}
        onClick={async () => {
          setLoading(true);
          const { error: err } = await actions.workspace.acceptInvite({ token });
          setLoading(false);
          if (err) return setError(err.message);
          window.location.href = "/app";
        }}
      >
        Accept invite
      </Button>
    </div>
  );
}

export function SignOutButton({
  variant = "outline",
  label = "Sign out",
}: {
  variant?: "outline" | "ghost" | "link";
  label?: string;
}) {
  return (
    <Button variant={variant} onClick={() => signOut()}>
      {label}
    </Button>
  );
}
