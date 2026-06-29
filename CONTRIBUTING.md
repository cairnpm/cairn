# Contributing to Cairn

Thanks for taking the time. Cairn is small and opinionated — contributions that
keep it focused are the most welcome.

## Before a big change

Open an **issue or discussion first** for anything non-trivial (a new screen, a
new dependency, a behaviour change). It saves everyone a rejected PR. Small fixes
and docs can go straight to a PR.

## Local setup

```bash
pnpm install
echo 'ANTHROPIC_API_KEY=sk-ant-…' > .env   # optional; without it the agent uses the offline fallback
pnpm dev                                    # http://localhost:3000
```

Default login on first boot: `ceo@cairn.local` / `cairn`.

## Tests

```bash
pnpm test:members                 # auth, invitations, roles — hermetic (temp DB), no network
INTAKE_TEST_STUB=1 pnpm test:intake   # intake routing against the deterministic stub (offline)
pnpm test:intake                  # same, but against the real Anthropic API (needs a key)
```

CI-safe tests must not hit the network and must not touch `.data/`. The members
suite is the template: it runs on a throwaway SQLite file.

## Conventions

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org), in
  English. `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, optional scope —
  e.g. `feat(intake): …`, `fix(layout): …`.
- **Branches**: `feat/short-slug`, `fix/short-slug`.
- **PRs**: keep them focused; describe the *why*, link the issue, include a
  screenshot for UI changes.
- **Code**: match the surrounding style — TypeScript, no semicolons-as-noise,
  comments explain *why* not *what*, French in user-facing copy / English in code.

## Architecture in one breath

- Every write goes through the **single gateway** (`server/gateway/`) and the Nitro
  API — attribution comes from the authenticated session, never the request body.
- The LLM lives behind one **provider interface** (`server/llm/`) with a real
  Anthropic implementation and a deterministic offline stub.
- SQLite is **single-writer** — assume one process; never add horizontal scaling.

See [`docs/intake.md`](./docs/intake.md) for how the agent routes signals.

## License of contributions

By contributing, you agree your contributions are licensed under the project's
[FSL-1.1-ALv2](./LICENSE) (which becomes Apache-2.0 two years after each release).
