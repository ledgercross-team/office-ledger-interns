import { useEffect, useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import QRCode from "qrcode";
import { BellRing, CalendarSync, KeyRound, Laptop, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { NotifyPrefs } from "@/db/schema/workspace";

interface Props {
  canTwoFactor: boolean;
  prefs: NotifyPrefs | null;
  icalToken: string | null;
  vapidKey: string;
}

type SessionRow = { id: string; token: string; userAgent?: string | null; ipAddress?: string | null; createdAt: Date; updatedAt: Date };

function device(ua?: string | null) {
  if (!ua) return "Unknown device";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return [br, os].filter(Boolean).join(" on ");
}

function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function TwoFactor() {
  const { data: session, refetch } = authClient.useSession();
  const enabled = !!(session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled;
  const [step, setStep] = useState<"idle" | "password" | "verify" | "disable">("idle");
  const [password, setPassword] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [backup, setBackup] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (error) return toast.error(error.message ?? "Password incorrect");
    if (data.method !== "totp") return toast.error("Unexpected two-factor method.");
    setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 }));
    setSecret(new URL(data.totpURI).searchParams.get("secret"));
    setBackup(data.backupCodes);
    setStep("verify");
  }
  async function verify() {
    setBusy(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
    setBusy(false);
    if (error) return toast.error("That code didn't match. Try the next one.");
    toast.success("Two-factor authentication is on");
    setStep("idle");
    setPassword("");
    void refetch();
  }
  async function disable() {
    setBusy(true);
    const { error } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (error) return toast.error(error.message ?? "Password incorrect");
    toast.success("Two-factor authentication turned off");
    setStep("idle");
    setPassword("");
    void refetch();
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 text-primary" aria-hidden />
        <div>
          <p className="font-medium">Two-factor authentication {enabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</p>
          <p className="text-sm text-muted">Use an authenticator app (TOTP) in addition to your password.</p>
        </div>
      </div>
      <Button variant={enabled ? "outline" : "primary"} size="sm" onClick={() => setStep(enabled ? "disable" : "password")}>
        {enabled ? "Turn off" : "Set up"}
      </Button>
      <Dialog open={step !== "idle"} onOpenChange={(o) => !o && setStep("idle")}>
        <DialogContent title={step === "disable" ? "Turn off two-factor authentication" : "Set up two-factor authentication"}>
          {(step === "password" || step === "disable") && (
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void (step === "disable" ? disable() : start()); }}>
              <Field label="Confirm your password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              <Button type="submit" loading={busy}>{step === "disable" ? "Turn off" : "Continue"}</Button>
            </form>
          )}
          {step === "verify" && (
            <div className="grid gap-4">
              <p className="text-sm text-muted">Scan this QR code with your authenticator app, then enter the 6-digit code.</p>
              {qr && <img src={qr} alt="Authenticator QR code" className="mx-auto size-48 rounded-xl bg-white p-2" />}
              {secret && <p className="text-center font-mono text-xs break-all text-muted">Manual key: {secret}</p>}
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-sm font-medium">Backup codes</p>
                <p className="mb-2 text-xs text-muted">Store these somewhere safe. Each works once.</p>
                <ul className="grid grid-cols-2 gap-1 font-mono text-xs">{backup.map((b) => <li key={b}>{b}</li>)}</ul>
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
                <Input inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Verification code" />
                <Button type="submit" loading={busy}>Verify</Button>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ProfileSecurity({ canTwoFactor, prefs, icalToken, vapidKey }: Props) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [p, setP] = useState<NotifyPrefs>(prefs ?? { emailDigest: true, push: false, emailOnDecision: true });
  const [token, setToken] = useState(icalToken);

  const loadSessions = async () => {
    const [{ data: list }, { data: s }] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
    setSessions((list as SessionRow[] | null) ?? []);
    setCurrent(s?.session.token ?? null);
  };
  useEffect(() => {
    void loadSessions();
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next.length < 10) return toast.error("Use at least 10 characters.");
    setBusy("pw");
    const { error } = await authClient.changePassword({ currentPassword: pw.current, newPassword: pw.next, revokeOtherSessions: true });
    setBusy(null);
    if (error) return toast.error(error.message ?? "Couldn't change password");
    toast.success("Password changed. Other devices were signed out.");
    setPw({ current: "", next: "" });
    void loadSessions();
  }

  async function savePrefs(next: NotifyPrefs) {
    if (next.push && !p.push) {
      try {
        if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Push isn't available in this browser or isn't configured on the server.");
        const perm = await Notification.requestPermission();
        if (perm !== "granted") throw new Error("Notifications are blocked for this site.");
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        await actions.notifications.subscribePush({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
      } catch (e) {
        return toast.error((e as Error).message);
      }
    }
    if (!next.push && p.push && "serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await actions.notifications.unsubscribePush({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
    }
    setP(next);
    const { error } = await actions.employees.updateNotifyPrefs(next);
    if (error) toast.error(error.message);
  }

  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const feedUrl = token ? `${origin}/api/ical/${token}` : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Security" description="Password, two-factor authentication and signed-in devices." />
        <CardBody className="grid gap-5">
          <form onSubmit={changePassword} className="grid gap-3">
            <p className="flex items-center gap-2 font-medium"><KeyRound className="size-4 text-muted" aria-hidden /> Change password</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
              <Field label="New password" hint="At least 10 characters."><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            </div>
            <Button type="submit" size="sm" className="justify-self-start" loading={busy === "pw"} disabled={!pw.current || !pw.next}>Update password</Button>
          </form>
          {canTwoFactor && <TwoFactor />}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-medium">Signed-in devices</p>
              <Button
                size="sm"
                variant="outline"
                loading={busy === "revoke"}
                disabled={!sessions || sessions.length < 2}
                onClick={async () => {
                  setBusy("revoke");
                  await authClient.revokeOtherSessions();
                  setBusy(null);
                  toast.success("Signed out of other devices");
                  void loadSessions();
                }}
              >
                <LogOut aria-hidden /> Sign out other devices
              </Button>
            </div>
            <ul className="grid gap-2">
              {!sessions && <li className="skeleton h-12" />}
              {sessions?.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                  {/Mobile|Android|iPhone/.test(s.userAgent ?? "") ? <Smartphone className="size-4 text-muted" aria-hidden /> : <Laptop className="size-4 text-muted" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{device(s.userAgent)} {s.token === current && <Badge tone="success">This device</Badge>}</span>
                    <span className="text-xs text-muted">Last active {new Date(s.updatedAt).toLocaleString()}</span>
                  </span>
                  {s.token !== current && (
                    <Button size="sm" variant="ghost" onClick={async () => { await authClient.revokeSession({ token: s.token }); void loadSessions(); }}>Sign out</Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </CardBody>
      </Card>
      <div className="grid content-start gap-6">
        <Card>
          <CardHeader title="Notifications" description="In-app notifications are always on." />
          <CardBody className="grid gap-4">
            {(
              [
                ["emailDigest", "Daily email digest", "A morning summary of what needs your attention."],
                ["emailOnDecision", "Email me about decisions", "When your leave, corrections or issues are reviewed."],
                ["push", "Browser push notifications", "Get alerts on this device even when the tab is closed."],
              ] as const
            ).map(([k, label, hint]) => (
              <label key={k} className="flex items-start justify-between gap-4">
                <span>
                  <span className="flex items-center gap-2 text-sm font-medium">{k === "push" && <BellRing className="size-4 text-muted" aria-hidden />}{label}</span>
                  <span className="text-xs text-muted">{hint}</span>
                </span>
                <Switch checked={p[k]} onCheckedChange={(v) => savePrefs({ ...p, [k]: v })} aria-label={label} />
              </label>
            ))}
          </CardBody>
        </Card>
        {feedUrl && (
          <Card>
            <CardHeader title="Calendar feed" description="Subscribe in Google Calendar, Outlook or Apple Calendar to see your meetings, leave and holidays." />
            <CardBody className="grid gap-3">
              <div className="flex gap-2">
                <Input readOnly value={feedUrl} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar feed URL" className="font-mono text-xs" />
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(feedUrl).then(() => toast.success("Copied"))}><CalendarSync aria-hidden /> Copy</Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="justify-self-start"
                onClick={async () => {
                  if (!confirm("Reset the feed URL? Existing subscriptions will stop updating.")) return;
                  const { data } = await actions.employees.regenerateIcal();
                  if (data) setToken(data.token);
                }}
              >
                Reset feed URL
              </Button>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
