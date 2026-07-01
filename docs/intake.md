# Intake & gateway — rules and behavior

> Source of truth: `server/gateway/intake.ts` (state machine + commit),
> `server/llm/anthropic.ts` (agent prompts), `server/domain/betting.ts` +
> `server/domain/bet.ts` (betting menu + bets), `server/db/stale.ts` (anti-backlog).
> This document describes the actual behavior of the code, not an intention.

## 1. Philosophy — Shape Up, bottom-up

Cairn is a **bottom-up Product OS**: you don't fill a backlog by hand, you
let **signals bubble up** and condense into _shaped_ features, then _bettable_ ones,
then grouped into **Hills** (cycles). Direct inspiration from **Shape Up**:

- You **shape** before betting: a raw signal becomes a _pitch_ (real problem,
  appetite, sketched solution, rabbit holes, no-gos) — not a reworded request.
- You **bet** explicitly (human), never automatically: a bet creates/populates a Hill.
- **Anti-backlog**: whatever isn't bet on goes stale (`stale`) and must be re-defended.
- **No reopening** of a delivered solution: you shape a new linked iteration.

The full flow, bottom to top:

```
raw signal ──intake──▶ feature (shaped) ──scored menu──▶ betting table ──vote──▶
   owner validates ──▶ Hill (active cycle) + bet features (bet → building → done)
```

**Intake is the only write door** into the domain. `intakeCommit()` is the sole
path that INSERTs/UPDATEs `features` / `feedback`. The views (Backlog, Betting, Hills) are
read-only; the only other writes are **decisions** (bet/pass/defer) and
the **validation** of a betting table — both going through `recordDecision()`.

## 2. The lifecycle (statuses)

`feedback` (raw signal) — status: `new | routed | pending_review | archived`.

`features` — status: `raw → shaped → bet → building → done`, plus `archived` (merged)
and `deleted` (reversible soft-delete). Transitions:

| From → to | Trigger |
|---|---|
| ∅ → `shaped` | intake `create_feature` (every new feature is born shaped, `signal_count=1`) |
| `shaped` → `shaped` (enriched) | intake `append` (attaches a signal + refines the pitch, `signal_count+1`, `stale=0`) |
| `shaped` → `bet` | `recordDecision('bet')` (validation of a betting table or manual decision) → `hill_id` set |
| `shaped` → `shaped` (stale) | not bet on for `NUXT_STALE_DAYS` (14d) → `stale=1`, to be re-defended |
| `*` → `archived` | feature absorbed by a `merge` |
| `done`/`archived` → **new iteration** | intake `refine` on a delivered feature → `create_feature` with `supersedes_id` |
| `*` → `deleted` | deletion (soft); reactivatable → `prev_status` |

`pass` / `defer` do **not** change the status (the feature stays `shaped`, with no auto-carry;
`pass` and `defer` merely penalize its score in the next menu).

## 3. The intake state machine

One turn = `POST /api/intake/turn`. The conversation is bounded and always converges
toward a **proposal** that the human confirms (`POST /api/intake/commit`).

```
                 detectIntent(message)
                        │
        ┌───────────────┼────────────────┬──────────────┐
      query           signal           refine          merge
   (read-only)          │           (named feature)  (2 features)
        │               ▼                 │              │
   answerQuery     ┌─ gather ◀────────────┴──────────────┘
   (no write)      │     │ clarify (bounded loop: one targeted question at a time)
                   │     ▼
                   └▶ propose ──(low confidence, signal mode)──▶ pending_review
                         │                                     (human arbitrates)
                         ▼
                  commit  ←── ONLY domain write
```

- **`gather` → `clarify`**: as long as the agent could not write a confident pitch, it
  asks **one** shaping question. Loop bounded by `MAX_CLARIFY` (8 agent questions) and
  `MAX_TURNS` (18, safety cap that forces the proposal).
- **`propose`**: the agent produces an **action** + a **pitch** (`proposed_spec`) + a
  confidence + a rationale. Nothing is written.
- **`pending_review`**: in `signal` mode, if `confidence < NUXT_CONFIDENCE_THRESHOLD`
  (0.45), the agent **does not write** and asks the human to decide (create vs attach to
  a candidate). `refine` / `merge` are explicit directives → no arbitration.
- **`commit`**: applies the proposal in a transaction. Idempotent by `content_hash`.

> **`query` mode (cross-cutting search, read-only)**: the agent answers from a **snapshot
> of the whole product** (`workspaceContext`) — backlog counters, `shaped` features, work
> in progress per cycle, recently delivered, **Hills** with progress (%), betting tables, recent
> activity — plus the detail of the focused feature if the question names one. It can therefore
> answer "which Hills are active and at what progress?", "what have we delivered?", "where does
> feature Y stand?". Every turn the intent is **re-detected**: you can ask a question
> then switch to writing ("ok create a ticket for X" / "refine feature Y") without
> starting a new session. The answer is **grounded** on the snapshot ("if the state doesn't
> answer, say so; don't make anything up").

## 4. The 4 routing intents / actions

`detectIntent` classifies the message into `query | signal | refine | merge` (strict schema,
`temperature: 0`). The `propose` produces an `action` among `create_feature | append | discard`
(the `merge` is resolved upstream, outside the LLM). Effects at commit:

| Action | When | Effect on the domain |
|---|---|---|
| `create_feature` | no candidate is the same feature; or `refine` of a **delivered** feature | INSERT `shaped` feature (`supersedes_id` if new iteration); event `created` |
| `append` | a **`shaped`** candidate addresses the **same problem**; or `refine` of a **`shaped`** feature | UPDATE feature (refined fields before→after), `signal_count+1`, `stale=0`, re-embed; event `signal_added` (digest of the modified fields) |
| `merge` | explicit directive "merge X and Y" / "X is a duplicate of Y" | repatriates feedback/decisions/PR/events of the absorbed → survivor, consolidated pitch, absorbed `archived`; `merged` events on both sides |
| `discard` | **true noise** (spam/test/off-product) or an **exact** duplicate that adds nothing — **never** a bug | feedback `archived`, no feature mutation; event `discarded` (if target) |

The raw `feedback` is **always** stored (even a `discard` → `archived`), with its
`content_hash`, its `embedding` and its `classification` (`musing | explore | directive`).

## 5. Deduplication — always, at two levels

Dedup is not optional: **every turn** goes through a candidate search, and
the commit re-checks idempotence.

### 5.1 Semantic (every turn) — `topCandidates()`

- Local embedding of the signal, **cosine similarity** against features with `status = 'shaped'`
  **only** → top‑5, floor threshold `CANDIDATE_FLOOR` (0.15).
- **Important**: the only `append` targets are **`shaped`** features. Everything else
  (`done`, `archived`, `deleted`, **and the `bet`/`building` ones already committed to a cycle**) is
  excluded from candidates — a signal **never** attaches to delivered work nor to a bet in progress
  (see §6). Features in a cycle are injected separately as **roadmap context** (read-only).
- The agent acts as a **dedup judge** (prompt `propose`): the score is a _hint_, not a
  rule. If there is a candidate that addresses **the same underlying problem** — even phrased very
  differently — it chooses `append`. It chooses `create_feature` only if **no**
  candidate is really the same feature ("creating is a deliberate act; duplicates
  pollute the backlog"). It chooses `discard` if the contribution is null.

### 5.2 Exact (at commit) — idempotence

- `content_hash = sha256(normalized raw)`. If a feedback with this hash has already been routed to
  a feature → **idempotent no-op** (response `idempotent: true`, no double write).

### 5.3 Anti-echo guard

On `append`, a pitch field is **never** overwritten by the user's raw
instruction (echo detection): the offline stub cannot degrade a shaped pitch.

## 6. We only amend `shaped` features (neither delivered, nor already in a cycle)

Shape Up "fixed scope" rule: you don't grow the scope of a bet in progress, and you don't
reopen delivered work. **Only `shaped` features are amendable** (`append`/`refine`).
Four mechanisms guarantee this:

1. **Dedup scope**: `topCandidates` only searches within `status = 'shaped'` → no
   attachment to a delivered feature **nor to a `bet`/`building` feature already in a cycle**.
2. **Refine on delivered → new iteration**: a `refine` targeting a `done`/`archived` feature
   does **not** `append` — it switches to `create_feature` with `supersedes_id` toward the
   delivered version ("no reopening"). Event `created` with `{ supersedes }`.
3. **Refine on a feature in a cycle → new feature**: a `refine` targeting a
   `bet`/`building` feature does **not** modify the scope of the bet in progress — the agent proposes a
   **new feature** "for a next cycle".
4. **Roadmap context + decisions guardrail**: features in a cycle are injected as read-only context
   ("frozen scope — do not amend"); and a `bet`/`pass`/`defer` verdict on a
   `done`/`archived` feature is rejected (409) on the `decisions.post.ts` side.

## 7. How the agent challenges the context-gathering (to route correctly)

Explicit stance: the agent is a **senior PM who protects a finite roadmap, not an order-taker
nor a yes-man**. It favors the **right decision** over agreeing with the user. Framing
inspired by anti-sycophancy best practices ("ask, don't tell"; surfacing assumptions;
prioritizing accuracy over agreement) and by the critical questions of Shape Up. Four levers:

### 7.1 Skeptical shaping (prompt `clarify`)

The agent **does not accept the request as-is** and does not flatter. It:

- **reframes the request as a problem** (what concretely breaks today, for whom, at
  what frequency) before any solution;
- **challenges** like a PM: does the problem really matter? why now rather
  than something else? what is the cost of doing this rather than something else? what does success look like?
- **probes the appetite** (small = days / big = weeks) and its justification;
- **flags the unbounded** (open rabbit holes, fuzzy success, scope that can explode) — it does not
  pretend it's bettable. A bettable pitch is **rough + solved + bounded**;
- asks **only one** sharp question at a time, as many turns as needed (no
  padding); replies **`OK`** as soon as it could write a confident pitch **or** conclude that there
  is no real problem to shape (pure noise). A low-priority but real problem **remains**
  to be shaped — the timing is decided at the bet, not at intake.

End detection: an explicit `OK`, or an answer without a `?` → move to `propose`.

### 7.2 Dedup judge + critical PM (prompt `propose`)

The prompt injects the **product context** (`ARCHITECTURE_CONTEXT`), the similar candidates **and
the roadmap context** (active cycles + features in progress). It asks to:

- **judge the meaning, not the numbers** — `append` if a candidate is the same feature;
  `create_feature` only for a genuine novelty;
- **narrow `discard`**: only **true noise** (spam, test, off-product) or an **exact**
  duplicate that adds nothing. A **bug is in-scope** (intake is the entry door for bugs) →
  shape it into a fix pitch, **never** "that goes in Jira". "Not now" / low
  priority **is not** a reason to discard (that's a betting decision) — default = **capture**;
- respect the **frozen scope** of features in a cycle (never `append` → new feature);
- **surface its assumptions** and the **missing context** in the `rationale`, separating
  fact from interpretation.

### 7.3 Human arbitration under uncertainty

- In `signal` mode, `confidence < 0.45` → `pending_review`: the agent exposes the candidates
  (with %) and **asks the human to decide** rather than guessing.
- The human **always** confirms/corrects the proposal before writing ("Do you confirm, or
  do you correct?"). We measure the model's quality via `routing_log.corrected` (did the human
  change the agent's **first** proposal: different action or target).

## 8. Merge & grouping (group)

Two distinct notions:

- **Merge (intake)** — human directive "merge X and Y". The agent resolves the **survivor**
  (target2, kept) and the **absorbed** (target). At commit: feedback/decisions/PR/events of
  the absorbed re-parented onto the survivor, **consolidated** pitch (Claude rewrites it covering
  both), `signal_count` summed, absorbed moved to `archived`. If only one of the two is
  resolved → treated as a `refine`; if neither → `signal`.
- **Group (betting menu)** — automatic **thematic** grouping of the betting menu by
  greedy clustering on the embeddings (`CLUSTER_THRESHOLD = 0.4`). Each candidate receives a
  `theme`. This is presentation/prioritization, it mutates no feature.

## 9. From shaped to bettable, then to Hill

### 9.1 Scored menu (`computeMenu`)

Only `shaped` features enter the menu. Score:

```
score = (1 + signal_count) × recency × appetite × deferPenalty × stalePenalty
```

| Factor | Value |
|---|---|
| `recency` | `exp(-ageDays / 21)` (half-life ~3 weeks, on `updated_at`) |
| `appetite` | `big = 1.3`, otherwise `1` |
| `deferPenalty` | last decision `defer = 0.8`, `pass = 0.5`, otherwise `1` |
| `stalePenalty` | `stale = 0.6`, otherwise `1` |

Then thematic clustering (§8) → menu ordered by score, grouped by theme. Shared by
the live preview and the frozen **snapshot** of a betting table (same ranks).

### 9.2 Betting table → vote → Hill

1. **Snapshot**: creating a betting table freezes the current menu (features move afterward,
   the table stays stable). Denormalized candidates (`title_snap`, `problem_snap`, …).
2. **Vote**: each member votes (toggle); tally + voter avatars; timeline of events.
3. **Validation (owner only)**: creates an `active` **Hill** `{name, starts_at, ends_at}`.
   For each selected candidate **still `shaped`** → `recordDecision('bet')` (feature
   `bet`, `hill_id` set, event `bet`). A candidate that changed status since the snapshot
   (already `bet`/`done`/`archived`/merged) is **skipped**, never reopened. The table moves to
   `validated`, event `validated` with `{ hill_id, bet, skipped }`.

The **"why"** of a Hill = the validation rationale (shared by its betting
decisions), displayed above the bet features.

## 10. Tracking the whole history (audit)

Everything is tracked, append-only:

| Table | Content |
|---|---|
| `feature_events` | timeline per feature: `created`, `signal_added` (signal content + refined fields before→after), `merged`, `discarded`, `bet`/`pass`/`defer`, `stale`, `pr_linked`/`pr_merged`, `deleted`/`restored`. `actor_type` = `user | agent | system`. |
| `routing_log` | each routing decision: `action`, `target_feature_id`, `confidence`, `rationale`, `model`, **`corrected`** (human changed the 1st proposal). |
| `feedback` | each raw signal kept (even `discard` → `archived`), with `classification`, `content_hash`, `embedding`. |
| `decisions` | each `bet`/`pass`/`defer` with `rationale` (the mandatory "why") + `hill_id`. |
| `betting_events` | timeline of a table: `generated`, `vote_cast`/`vote_cleared`, `validated`, `cancelled`, `deleted`/`restored`. |

**Attribution**: the actor is derived from the **authenticated session** at commit time
(who commits, not who opens the session) — never read from the body.

## 11. Constants (tunable)

| Constant | Default | Env | Role |
|---|---|---|---|
| `CONFIDENCE_THRESHOLD` | 0.45 | `NUXT_CONFIDENCE_THRESHOLD` | below this threshold (signal mode), the human arbitrates |
| `CANDIDATE_FLOOR` | 0.15 | — | minimum similarity to enter the candidate list |
| `TOP_K` | 5 | — | number of dedup candidates |
| `MAX_TURNS` | 18 | — | turn cap (forces the proposal) |
| `MAX_CLARIFY` | 8 | — | cap on agent questions |
| `CLUSTER_THRESHOLD` | 0.4 | — | thematic clustering threshold of the menu |
| `STALE_DAYS` | 14 | `NUXT_STALE_DAYS` | days without a bet → `stale` |

> The LLM is behind a single interface (`LlmProvider`): Anthropic when a key is
> present, otherwise a **deterministic stub** (the gateway never blocks). Embeddings
> stay **local**. Any model response that fails degrades to the stub.

## 12. End-to-end tests (replayable)

Suite `tests/intake.test.ts` (vitest) that exercises the whole flow directly via the gateway
(`intakeTurn` → `intakeCommit`), on a **temporary SQLite DB** (never `.data/app.db`).

```bash
pnpm test:intake                      # REAL — real LLM (key read from .env), Sonnet model
INTAKE_TEST_STUB=1 pnpm test:intake   # HEURISTIC — deterministic stub, offline
ANTHROPIC_MODEL=claude-opus-4-8 pnpm test:intake     # force a model
```

Scenarios: **creation** (new signal → shaped feature), **deduplication / amend** (a
complement enriches the existing feature → `append`, no duplicate — *real only*, the
threshold stub does not replicate this judgment), **merge** (merging two named features → one
archived, the other survives), **query** (question → answer, no write), **fixed scope**
(a signal close to a feature already in a cycle does not amend it).

> Real tests are **non-deterministic** by nature (the model decides): we use Sonnet
> (more consistent routing than Haiku) and behavioral assertions. A real problem must
> always be **captured** (create/append), never discarded — which is precisely what we verify.
