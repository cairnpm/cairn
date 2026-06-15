# Bicycle — Product OS

A constrained Shape Up product pipeline. This repo currently holds the **UI shell** —
the read-only views and the conversational intake surface — mirroring the
**minnanonihongo** technical stack. The write gateway + DB land next (see the brief).

## Stack (ISO)

- **Nuxt 4** + **Tailwind v4** (`@tailwindcss/vite`)
- **shadcn-vue** (`shadcn-nuxt`, new-york style, neutral base) — `Button`, `Card`,
  `Input`, `Sheet`, `Table`, `Tabs`
- **Inter** type, real **file-based routing** (one page per screen)

## Requirements

- Node **>= 22** (the upcoming DB layer uses the built-in `node:sqlite`).

## Setup

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

If `pnpm dev` misbehaves inside a git worktree (vite-node socket), use the prod build:

```bash
pnpm build && PORT=3000 node .output/server/index.mjs
```

## Routes

| Route          | Screen                                            |
|----------------|---------------------------------------------------|
| `/`            | Intake (conversational, in-memory for now)        |
| `/backlog`     | Backlog — table/pipeline view + detail Sheet      |
| `/betting`     | Betting Table — candidates + vote, detail Sheet   |
| `/hills`       | Hills overview                                     |
| `/hills/[id]`  | Hill detail (e.g. `/hills/12`)                     |

## Structure

```
app/
  app.vue                       # NuxtLayout + NuxtPage
  layouts/default.vue           # sidebar + header shell
  assets/css/tailwind.css       # Tailwind v4 + shadcn neutral theme
  lib/utils.ts                  # cn() helper
  composables/useBicycle.ts     # in-memory state + derived data (no DB yet)
  components/
    AppSidebar.vue, AppHeader.vue
    screens/                    # IntakeScreen, BacklogScreen, BettingScreen, HillsScreen
    ui/                         # shadcn-vue components
  pages/                        # index, backlog, betting, hills/(index|[id])
components.json                 # shadcn-vue config
nuxt.config.ts
```

> ⚠️ State is in-memory only — nothing is persisted. The next phase introduces the
> single write gateway (Nitro server routes), the Shape Up domain model
> (`feedback → feature → hill → decision`) and a local SQLite DB via `node:sqlite`.

## Adding more shadcn components

```bash
pnpm dlx shadcn-vue@latest add dialog
```
