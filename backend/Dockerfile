# Build context must be the repo root (needs pnpm-lock.yaml and the workspace file).
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
# root `prepare` runs `git config` and git isn't in the image
RUN npm pkg delete scripts.prepare \
 && pnpm install --frozen-lockfile --filter backend...
COPY backend backend
# CI=true lets pnpm drop dev dependencies without a TTY prompt
RUN pnpm --filter backend build \
 && CI=true pnpm install --prod --frozen-lockfile --filter backend...

FROM node:24-slim
ENV NODE_ENV=production PORT=4000
WORKDIR /repo/backend
COPY --from=build --chown=node:node /repo /repo
USER node
EXPOSE 4000
CMD ["node", "dist/main"]
