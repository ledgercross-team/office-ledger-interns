# Build context must be the repo root (needs pnpm-lock.yaml and the workspace file).
FROM node:24-slim AS build

ENV CI=true

RUN corepack enable \
 && corepack prepare pnpm@10.0.0 --activate

WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
# Root `prepare` runs a Git hook setup command. It is not needed in the image.
RUN npm pkg delete scripts.prepare \
 && pnpm install --frozen-lockfile --filter backend...
COPY backend backend

# Compile first, then leave only production dependencies in the runtime image.
RUN pnpm --filter backend build \
 && CI=true pnpm install --prod --frozen-lockfile --filter backend...

FROM node:24-slim
ENV NODE_ENV=production PORT=4000

WORKDIR /repo/backend
COPY --from=build --chown=node:node /repo /repo

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
 CMD node -e "const port=process.env.PORT||4000; fetch('http://127.0.0.1:'+port+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
