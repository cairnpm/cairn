/**
 * Short architecture summary injected into the shaping prompt so proposed solutions /
 * rabbit holes are grounded in this product's reality (brief: agent §3.4). Keep it terse —
 * NOT the whole repo. Fine code exploration happens in Claude Code at build time, not here.
 */
export const ARCHITECTURE_CONTEXT = `Product: "Cairn", a constrained Shape Up product pipeline.
Stack: Nuxt 4 + Nitro (server routes = the write gateway, the only write path), node:sqlite (file
SQLite, one machine), shadcn-vue (read-only UI + actions). Embeddings stored as JSON, dedup via
brute-force cosine in JS.
Domain: feedback (raw signal) → feature/pitch (problem, appetite, solution, rabbit holes, no-gos;
aggregates several feedback) → hill (cycle) → decision (bet/pass/defer). Append-only activity log
per feature.
Signals: a signal can be a bug, a request, an idea — ALL are product signals to capture here (the
intake IS the team's entry point, bugs included). A bug becomes a fix pitch (the problem = the bug).
NEVER redirect a signal to another tool.
Conventions: everything goes through the gateway; writing happens only on human confirmation; no
second Notion, no rotting backlog.`
