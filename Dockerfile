# syntax=docker/dockerfile:1.7
# ---- base -------------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate
WORKDIR /app

# ---- deps (all, for building) ---------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts=false

# ---- build ------------------------------------------------------------------------------------------
FROM deps AS build
# Baked into the sitemap, canonical URLs and the trusted host list.
ARG PUBLIC_SITE_URL=http://localhost:4321
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL NODE_ENV=production
COPY . .
RUN pnpm build

# ---- production dependencies only -------------------------------------------------------------------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# ---- runtime ----------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 STORAGE_DIR=/data/storage
WORKDIR /app
RUN groupadd --system --gid 1001 ledger && useradd --system --uid 1001 --gid ledger --home /app ledger \
  && mkdir -p /data/storage && chown -R ledger:ledger /data
COPY --from=prod-deps --chown=ledger:ledger /app/node_modules ./node_modules
COPY --from=build --chown=ledger:ledger /app/dist ./dist
COPY --chown=ledger:ledger package.json server.mjs ./
COPY --chown=ledger:ledger server ./server
COPY --chown=ledger:ledger scripts/migrate.mjs ./scripts/migrate.mjs
COPY --chown=ledger:ledger src/db/migrations ./src/db/migrations
COPY --chown=ledger:ledger src/db/sql ./src/db/sql
USER ledger
VOLUME ["/data"]
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.mjs"]
