# syntax=docker/dockerfile:1
# The public landing page: a static build of the site/ Nuxt layer, served by nginx.
#
# Build context is the REPO ROOT, not site/ — the layer extends the product app, so it needs the whole
# tree. Deploy with `pnpm site:deploy` (which passes the right --config/--dockerfile).
#
# Nothing like the product image: no Node at runtime, no database, no volume. It is stateless, so unlike
# the product it may run several machines.

# ── Build ────────────────────────────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Canonical, og:image and the sitemap are absolute URLs baked into the HTML at prerender time, so the
# domain has to be known HERE — it cannot be set at runtime.
ARG NUXT_SITE_URL=https://cairnpm.com
ENV NUXT_SITE_URL=$NUXT_SITE_URL
RUN pnpm site:generate

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/site/.output/public /usr/share/nginx/html
EXPOSE 80
