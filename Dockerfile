# syntax=docker/dockerfile:1
# Multi-stage build → small Node runtime. node:sqlite is built in (Node ≥ 22.5), so there is
# nothing native to compile. Data + uploads live under /data (mount a volume there).

# ── Build ────────────────────────────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime
WORKDIR /app
# git (+ CA certs) required at runtime: the code-aware intake clones + `git grep`s the linked product
# repo over HTTPS. node:*-slim ships neither — without git the clone can't run, and without
# ca-certificates git's TLS verification of github.com fails ("server certificate verification failed").
# Missing either → clone fails silently and shaping loses its code grounding (code_repo_linked = false).
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3000
# SQLite file + uploads on a persistent volume mounted at /data.
ENV NUXT_DB_URL=file:/data/app.db
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
