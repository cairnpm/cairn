# Self-hosting Cairn

Cairn is **self-hosted**: you run it, you own the data. It ships as a single Node
process backed by an embedded **SQLite** database — no external database, no
queue, no extra services. Bring your own Anthropic API key for the intake agent.

> **One instance only.** SQLite is single-writer, so Cairn runs on a single
> machine with a persistent volume. Don't scale it horizontally.

## What you need

- An **Anthropic API key** for the intake agent (`sk-ant-…`). Optional at boot —
  you can paste it later in **Settings → Intelligence**. Without a key, Cairn
  falls back to a deterministic offline router (reduced quality).
- A **session secret** (`NUXT_SESSION_PASSWORD`, ≥ 32 characters) to seal login
  cookies. Generate one with `openssl rand -base64 32`.
- A place to keep `/data` (the SQLite file + uploads) on a **persistent volume**.

The default team is seeded on first boot: `ceo@cairn.local` / `cairn`
(**change the password immediately** in Settings → Profil).

---

## Option A — Docker Compose (recommended)

The repo ships a [`docker-compose.yml`](./docker-compose.yml).

```bash
git clone https://github.com/cairnpm/cairn && cd cairn
cp .env.example .env          # set NUXT_SESSION_PASSWORD (+ ANTHROPIC_API_KEY)
docker compose up -d          # → http://localhost:3000
```

It pulls the prebuilt image `ghcr.io/cairnpm/cairn:latest` (published by CI). To
build from source instead, uncomment `build: .` in the compose file. Put it behind
a reverse proxy (Caddy, nginx, Traefik) for TLS.

---

## Option B — One-click on Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/cairnpm/cairn)

Render reads [`render.yaml`](./render.yaml): a Docker web service with a 1 GB
persistent disk at `/data` and an auto-generated session secret. Add your
`ANTHROPIC_API_KEY` in the dashboard (or later in Settings). Persistent disks
require a paid Render instance.

---

## Option C — Docker (manual build & run)

```bash
docker build -t cairn .
docker run -d --name cairn \
  -p 3000:3000 \
  -v cairn_data:/data \
  -e NUXT_SESSION_PASSWORD="$(openssl rand -base64 32)" \
  -e ANTHROPIC_API_KEY="sk-ant-…" \
  cairn
```

---

## Option D — Fly.io

A [`fly.toml`](./fly.toml) is included (one machine + a `/data` volume).

```bash
# 1. Install flyctl and sign in
brew install flyctl && fly auth login

# 2. Create the app + volume (pick your own app name / region)
fly apps create cairn
fly volumes create cairn_data --size 1 --region cdg

# 3. Secrets (never commit these)
fly secrets set NUXT_SESSION_PASSWORD="$(openssl rand -base64 32)"
fly secrets set ANTHROPIC_API_KEY="sk-ant-…"     # optional, or set in Settings

# 4. Ship it
fly deploy
```

---

## Updating

Pull the latest code and redeploy (`docker build` again, or `fly deploy`). The
SQLite schema migrates itself on boot — your data on `/data` is preserved.

## Backups

Everything lives in `/data`. Back it up by copying the volume, or snapshot it on
your host:

```bash
# Docker
docker run --rm -v cairn_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/cairn-$(date +%F).tgz -C /data .
```

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NUXT_SESSION_PASSWORD` | **yes** | — | ≥ 32 chars; seals auth cookies |
| `NUXT_DB_URL` | no | `file:/data/app.db` | SQLite file location (`file:` URL) |
| `ANTHROPIC_API_KEY` | no | — | Intake agent; can also be set in Settings |
| `PORT` | no | `3000` | HTTP port |
