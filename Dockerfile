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
ENV NODE_ENV=production
ENV PORT=3000
# SQLite file + uploads on a persistent volume mounted at /data.
ENV NUXT_DB_URL=file:/data/app.db
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
