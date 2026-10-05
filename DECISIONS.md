# Decisions

Defaults and judgement calls made while building Office Ledger v2. Newest phase last.

## Phase 1 – Scaffold & tooling

- **Astro 5.18** (not the newer Astro 7) because the brief pins Astro 5; matching adapters are `@astrojs/node@9`, `@astrojs/react@4`. **TypeScript 5.9** (TS 7's native compiler is not yet supported by `astro check`). **TanStack Table v8** (stable, widely documented) and **Vitest 3**.
- **Zod 3** for app code because Astro 5 Actions bundle Zod 3 (`astro:schema`); Better Auth carries its own Zod 4 internally.
- **Node adapter in `middleware` mode** + a tiny `server.mjs` (Node `http` + `sirv`) so security headers apply to prerendered marketing pages and static assets too, not only SSR responses.
- **No inline scripts on static pages**: the theme bootstrap is `/theme.js` (render-blocking, ~600 B) and `vite.build.assetsInlineLimit = 0` keeps Astro's processed scripts external. SSR pages get a per-request nonce for Astro's island hydration scripts (see Phase 3).
- **CSP `style-src` allows `'unsafe-inline'`**: React and Recharts emit inline style attributes; styles cannot execute script. `script-src` stays strict (`'self'` + nonce + `'strict-dynamic'`).
- **Docker-free local Postgres**: Docker needs root on some machines, so `pnpm db:local` starts a real Postgres 16 via the `embedded-postgres` npm package with the same credentials as `docker-compose.yml`. Unit tests use the same mechanism on port 54329 unless `TEST_DATABASE_URL` is set (CI uses a Postgres service).
- **Theme**: `light | dark | system`, stored per user (`users.theme`) and mirrored to a `theme` cookie so the server can render `data-theme` without a flash.
- **Status colours**: the brief lists violet for "late/reviewing" but the status-pill list says Late = amber. Pills follow the pill list (Late amber, On leave violet); violet is also used for "reviewing" complaints.
