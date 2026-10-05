import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = `/auth/two-factor${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      },
    }),
  ],
});

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined, fallback = "/app") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** Signs out and drops any app pages the service worker cached for offline use. */
export async function signOut(to = "/auth/sign-in") {
  navigator.serviceWorker?.controller?.postMessage("clear-pages");
  await authClient.signOut();
  window.location.href = to;
}
