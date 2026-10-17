# syntax=docker/dockerfile:1
# The Harbor API and background worker (apps/api). Railway builds this; docker-compose.yml runs it
# next to Postgres and the web app. Migrations run on start. Build from the repo root: docker build -t harbor-api .
FROM node:22-slim

# pnpm comes from corepack, pinned by packageManager in package.json. COREPACK_HOME is shared so the non-root user
# below runs the same pnpm without downloading it again.
ENV CI=true COREPACK_HOME=/usr/local/share/corepack COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# Manifests first: the install layer stays cached until dependencies change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/
COPY packages/ai/package.json packages/ai/
COPY packages/providers/package.json packages/providers/
# The API and the workspace packages it uses. tsx (a dev dependency) runs the TypeScript source, so dev deps stay.
# sharp installs its prebuilt linux binary (@img/sharp-linux-*) from the lockfile; no build tools needed.
RUN corepack install && pnpm install --frozen-lockfile --filter "@harbor/api..."

COPY packages packages
COPY apps/api apps/api

# Media library files: mount a volume here (Railway volume, compose volume). Railway sets PORT.
ENV NODE_ENV=production PORT=4800 HARBOR_MEDIA_DIR=/data/media
RUN mkdir -p /data/media && chown node:node /data/media /app/apps/api \
  && cd apps/api && node -e "import('sharp').then((m) => m.default({ create: { width: 2, height: 2, channels: 3, background: '#000' } }).png().toBuffer()).then(() => console.log('sharp works'))"
USER node

EXPOSE 4800
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.HARBOR_API_PORT || process.env.PORT || 4800) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Node runs the server directly (no pnpm wrapper), so a redeploy's SIGTERM reaches its shutdown handler and the old
# container exits 0. Under pnpm the stop was reported as a failure, which hosts flag as a crash.
WORKDIR /app/apps/api
CMD ["node", "--import", "tsx", "src/server.ts"]
