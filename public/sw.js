/* Office Ledger service worker: offline shell, static asset caching, network-first app pages, Web Push. */
const VERSION = "v2";
const STATIC = `ledger-static-${VERSION}`;
const PAGES = `ledger-pages-${VERSION}`;
const PRECACHE = ["/offline.html", "/favicon.svg", "/icon-192.png", "/manifest.webmanifest", "/theme.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache auth, data, actions, streams or private files.
  if (/^\/(api|_actions|auth)\//.test(url.pathname)) return;

  // Hashed build assets and icons: cache-first.
  if (url.pathname.startsWith("/_astro/") || /\.(png|svg|ico|woff2?|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // App pages: network-first, fall back to the last copy, then the offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname.startsWith("/app")) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/offline.html"))),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Office Ledger", body: "", url: "/app" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* plain payload */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
      tag: data.url,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/app", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.startsWith(self.location.origin));
      if (existing) {
        existing.focus();
        return existing.navigate(target);
      }
      return self.clients.openWindow(target);
    }),
  );
});

// Logout clears cached app pages so the next user on this device can't see them.
self.addEventListener("message", (event) => {
  if (event.data === "clear-pages") event.waitUntil(caches.delete(PAGES));
});
