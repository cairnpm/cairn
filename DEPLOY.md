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

Cairn tells you when a new release is out: **Settings → Workspace → Version** shows the
version this instance runs, whether a newer release exists, and the exact command for
**your** host. The check is a single anonymous `GET` to the GitHub releases API (at most
every 6 h) — no data, no identifier, no telemetry leaves the instance. Turn it off with the
switch right below, or set it once via the API (`update_check: false`). Each host's card links
straight back to its section here — the one-liner is the happy path, this is the full procedure.

**Your data survives every path below.** The schema migrates itself on boot and is strictly
additive (`CREATE TABLE IF NOT EXISTS` + guarded `ALTER TABLE ADD COLUMN` — nothing is ever dropped),
the demo seed only fires on an empty database, and both the SQLite file and the uploads live on
`/data`, never in the image layer. One exception worth knowing: every boot purges intake
*conversations* — committed ones after 2 days, abandoned ones after 14 (`NUXT_INTAKE_PURGE_STALE_DAYS`).
What they produced (features, feedback, routing log) is written at commit and kept.

### Docker Compose

```bash
cd /path/to/cairn
docker compose pull && docker compose up -d
```

`ghcr.io/cairnpm/cairn:latest` tracks the newest **tagged release**. Pin a version
(`:0.2.0`, `:0.2`) if you'd rather upgrade deliberately, or use `:main` for HEAD of main.

### Docker (manual)

```bash
docker inspect cairn -f '{{json .Mounts}}'   # ← check YOUR volume name first
docker pull ghcr.io/cairnpm/cairn:latest
docker rm -f cairn
docker run -d --name cairn -p 3000:3000 -v cairn_data:/data \
  -e NUXT_SESSION_PASSWORD="…" ghcr.io/cairnpm/cairn:latest
```

The named volume survives `docker rm` — that's where your data is. **Re-attach the same one.** If you
first started Cairn with a different volume name or a bind mount, pasting `-v cairn_data:/data` mounts
an empty volume and the instance comes back blank: nothing is deleted, but it reads exactly like data
loss. Hence the `docker inspect` on line one.

### Fly.io

```bash
git pull && fly deploy
```

`fly deploy` updates the **same machine in place** and re-attaches the **same volume**, so a
redeploy never wipes `/data`. Keep it that way: run exactly **one machine** (single-writer SQLite),
never `fly scale count >1`, and never a `bluegreen`/`canary` deploy strategy — those spin up a second
machine on a fresh, empty volume. The included `fly.toml` pins `strategy = "rolling"` for this reason.

### Render

Render auto-deploys when the connected repo moves. To pull a new upstream release, sync your
fork and let it deploy, or trigger it by hand:

```bash
render deploys create <service-id> --wait
```

(Or **Manual Deploy → Deploy latest commit** in the dashboard.) Settings → Version fills the
service id in for you — it reads Render's own `RENDER_SERVICE_ID`.

### From source

```bash
git pull && pnpm install --frozen-lockfile && pnpm build
```

Then restart the service — `node .output/server/index.mjs` is the entrypoint, so it's whatever
supervises it: `systemctl restart cairn`, `pm2 restart cairn`, `docker restart …`. `pnpm preview`
is a **foreground** preview server: fine to eyeball a build, wrong for a running instance.

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
| `CAIRN_HOST` | no | auto | `fly` \| `render` \| `docker` \| `source` — overrides the host Cairn detects, so Settings → Version shows the right update command (Kubernetes, systemd, an unknown PaaS) |
