# syntax=docker/dockerfile:1
# The Harbor web app (apps/web) as a Next standalone server, for self-hosting with docker-compose.yml (Vercel builds
# it on its own). Build from the repo root: docker build -f apps/web/Dockerfile -t harbor-web .
FROM node:22-slim AS build

ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN corepack install && pnpm install --frozen-lockfile --filter "@harbor/web..."

COPY packages/core packages/core
COPY apps/web apps/web
RUN pnpm --filter @harbor/web build

# Only the traced server, its static assets and public/. The API URLs and sign-in settings are read at runtime.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=4801 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node

EXPOSE 4801
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4801) + '/icon.svg').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/web/server.js"]
