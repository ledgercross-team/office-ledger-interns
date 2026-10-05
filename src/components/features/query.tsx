import { QueryClient, QueryClientProvider, useQuery, type QueryKey } from "@tanstack/react-query";
import type { ComponentType, ReactNode } from "react";
import { Toaster } from "sonner";

const g = globalThis as unknown as { __ledgerQC?: QueryClient; __ledgerLive?: EventSource };

/** One QueryClient shared by every island on the page (and across View Transition navigations). */
export const queryClient =
  g.__ledgerQC ??
  (g.__ledgerQC = new QueryClient({
    defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: true, retry: 1 } },
  }));

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Wrap an island's root component so it can use TanStack Query. */
export function withQuery<P extends object>(Component: ComponentType<P>) {
  const Wrapped = (props: P) => (
    <QueryClientProvider client={queryClient}>
      <Component {...props} />
    </QueryClientProvider>
  );
  Wrapped.displayName = `withQuery(${Component.displayName ?? Component.name})`;
  return Wrapped;
}

/**
 * useQuery seeded with server-rendered data. `fetcher` usually calls an Astro Action with `.orThrow`.
 * Server events with the same topic (first key segment) invalidate it automatically.
 */
export function useServerQuery<T>(key: QueryKey, fetcher: () => Promise<T>, initial: T | undefined, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: key,
    queryFn: fetcher,
    initialData: initial,
    initialDataUpdatedAt: initial === undefined ? undefined : Date.now(),
    enabled: opts.enabled ?? true,
  });
}

export const refreshAll = () => queryClient.invalidateQueries();

type LiveHandler = (e: { title: string; body: string | null; link: string | null }) => void;
const handlers = new Set<LiveHandler>();

/** Starts (once) the SSE connection. Invalidations refresh matching queries in every island. */
export function startLive() {
  if (typeof window === "undefined" || g.__ledgerLive) return;
  const es = new EventSource("/api/stream");
  g.__ledgerLive = es;
  es.addEventListener("invalidate", (ev) => {
    const { topic } = JSON.parse((ev as MessageEvent).data) as { topic: string };
    void queryClient.invalidateQueries({ queryKey: [topic] });
    if (topic !== "shell") void queryClient.invalidateQueries({ queryKey: ["shell"] });
  });
  es.addEventListener("notification", (ev) => {
    const data = JSON.parse((ev as MessageEvent).data);
    handlers.forEach((h) => h(data));
  });
}
export function onLiveNotification(h: LiveHandler) {
  handlers.add(h);
  return () => void handlers.delete(h);
}

export function AppToaster() {
  return <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: "!rounded-xl" }} />;
}
