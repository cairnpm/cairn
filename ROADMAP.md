# Roadmap

A living, honest view of where Cairn is going. Dates are intentionally absent —
this is direction, not commitment. Have an opinion? Open a
[discussion or issue](../../issues).

## Now (shipped / stabilising)

- **Intake agent** — triage, clarify, propose, commit; transcript → N features;
  `.docx` and image attachments; deduplication; full attribution.
- **Shape Up loop** — backlog, betting tables (vote → validate), hills, frozen scope.
- **Workspace** — email/password auth, token invitations, roles, soft-remove,
  avatars, audit trail.
- **Self-hosting** — single container, embedded SQLite, Fly.io config, BYO key.

## Next

- **Screenshots & first-run** — a clean demo dataset and an onboarding that
  explains Shape Up as you go.
- **Email delivery of invitations** — optional SMTP / provider, so invites can be
  emailed instead of copy-pasted (the link model is unchanged).
- **GitHub integration** — link PRs to features, auto-close on merge.
- **Slack notifications** — opt-in, for hills opened/closed and bets placed.
- **Search** — global command-palette search across signals, features and hills.
- **Better offline routing** — improve the deterministic fallback used without a key.

## Later

- **SSO / SAML / OIDC** — for organisations.
- **Multi-workspace / teams** — several workspaces under one account.
- **Advanced analytics** — routing quality, cycle health, throughput.
- **A managed cloud option** — only if it never compromises the self-hosted-first
  promise. Undecided.

## Business model (transparency)

The core — the full Shape Up loop, self-hosted, single workspace, bring-your-own
key — is **free and source-available, forever**. Some future **team/organisation**
capabilities (e.g. SSO, multi-workspace) may require a paid license key; the core
will always run without one, and your instance never depends on our servers.

See the [license](./LICENSE): every release becomes Apache-2.0 two years later.
