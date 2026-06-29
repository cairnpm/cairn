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

## Option A — Docker (anywhere)

```bash
# Build
docker build -t cairn .

# Run with a persistent volume for /data
docker run -d --name cairn \
  -p 3000:3000 \
  -v cairn_data:/data \
  -e NUXT_SESSION_PASSWORD="$(openssl rand -base64 32)" \
  -e ANTHROPIC_API_KEY="sk-ant-…" \
  cairn
```

Cairn is now on `http://localhost:3000`. Put it behind a reverse proxy
(Caddy, nginx, Traefik) for TLS.

---

## Option B — Fly.io

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
