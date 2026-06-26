import { all, db } from './client'

let _ready = false

// `CREATE TABLE IF NOT EXISTS` can't add a column to an already-created table — editing the
// CREATE statement is silently ignored on an existing DB. Every NEW column on an EXISTING table
// must go through this idempotent guard (safe on the Fly volume as in dev).
function addColumnIfMissing(table: string, col: string, ddl: string): void {
  const cols = all<{ name: string }>(`PRAGMA table_info(${table})`)
  if (!cols.some(c => c.name === col)) db().exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
}

/** Create all tables once. Idempotent. Mirrors the brief (§3) + intake_session. */
export function ensureSchema(): void {
  if (_ready) return
  db().exec(`
    -- Raw signals
    CREATE TABLE IF NOT EXISTS feedback (
      id             TEXT PRIMARY KEY,
      content        TEXT NOT NULL,
      source         TEXT NOT NULL,                  -- slack | call | email | manual | agent
      captured_by    TEXT,
      classification TEXT NOT NULL DEFAULT 'musing', -- musing | explore | directive
      status         TEXT NOT NULL DEFAULT 'new',    -- new | routed | pending_review | archived
      feature_id     TEXT REFERENCES features(id),
      content_hash   TEXT,                           -- idempotence intake
      embedding      TEXT,                           -- JSON vector
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Shaped / bettable units (= pitches; become "tickets" in build)
    CREATE TABLE IF NOT EXISTS features (
      id             TEXT PRIMARY KEY,
      title          TEXT NOT NULL,
      problem        TEXT NOT NULL,                  -- what actually breaks today
      appetite       TEXT,                           -- small | big
      solution       TEXT,                           -- shaped approach (the pitch's core idea)
      rabbit_holes   TEXT,                           -- risks / pitfalls to avoid
      out_of_bounds  TEXT,                           -- no-gos: explicitly excluded
      status         TEXT NOT NULL DEFAULT 'shaped', -- raw | shaped | bet | building | done | archived
      stale          INTEGER NOT NULL DEFAULT 0,
      hill_id        TEXT REFERENCES hills(id),
      signal_count   INTEGER NOT NULL DEFAULT 0,
      embedding      TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Cycles / time-boxes
    CREATE TABLE IF NOT EXISTS hills (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      starts_at   TEXT,
      ends_at     TEXT,
      status      TEXT NOT NULL DEFAULT 'planned',   -- planned | active | closed
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Bet journal (yes/no/why, persisted)
    CREATE TABLE IF NOT EXISTS decisions (
      id          TEXT PRIMARY KEY,
      feature_id  TEXT NOT NULL REFERENCES features(id),
      hill_id     TEXT REFERENCES hills(id),
      verdict     TEXT NOT NULL,                     -- bet | pass | defer
      appetite    TEXT,
      rationale   TEXT NOT NULL,                     -- the "why" is mandatory
      decided_by  TEXT,
      decided_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- GitHub PR links (autoclose)
    CREATE TABLE IF NOT EXISTS pr_links (
      id          TEXT PRIMARY KEY,
      feature_id  TEXT NOT NULL REFERENCES features(id),
      repo        TEXT NOT NULL,
      pr_number   INTEGER NOT NULL,
      pr_url      TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',      -- open | merged | closed
      auto_close  INTEGER NOT NULL DEFAULT 1,
      linked_at   TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at   TEXT
    );

    -- Gateway audit (each routing decision)
    CREATE TABLE IF NOT EXISTS routing_log (
      id                TEXT PRIMARY KEY,
      feedback_id       TEXT NOT NULL REFERENCES feedback(id),
      action            TEXT NOT NULL,               -- create_feature | append | merge | discard | pending
      target_feature_id TEXT REFERENCES features(id),
      confidence        REAL,
      rationale         TEXT,
      model             TEXT,
      corrected         INTEGER NOT NULL DEFAULT 0,  -- human changed the agent's first proposal
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Append-only activity log per feature (collaborative audit: who changed what, when).
    -- actor–action–object–timestamp; 'detail' carries before/after for replacements.
    CREATE TABLE IF NOT EXISTS feature_events (
      seq         INTEGER PRIMARY KEY AUTOINCREMENT, -- monotonic ordering
      feature_id  TEXT NOT NULL REFERENCES features(id),
      actor       TEXT NOT NULL,                     -- who (requester / decider / 'github')
      actor_type  TEXT NOT NULL DEFAULT 'user',      -- user | agent | system
      action      TEXT NOT NULL,                     -- created | signal_added | field_updated | bet | pass | defer | pr_linked | pr_merged
      summary     TEXT NOT NULL,                     -- human-readable line
      detail      TEXT,                              -- JSON: { field, before, after, content, ... }
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS events_by_feature ON feature_events (feature_id, seq);

    -- Team members (auth + role). Audit columns elsewhere store the display NAME, not this id,
    -- so existing rows + actorAvatar() keep working unchanged.
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'member',   -- owner | member
      avatar_bg     TEXT,
      avatar_init   TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Uploaded files (attached to a feature and/or the feedback that introduced them).
    CREATE TABLE IF NOT EXISTS attachments (
      id           TEXT PRIMARY KEY,
      feature_id   TEXT REFERENCES features(id),
      feedback_id  TEXT REFERENCES feedback(id),
      filename     TEXT NOT NULL,
      mime         TEXT NOT NULL,
      bytes        INTEGER NOT NULL,
      kind         TEXT NOT NULL,                    -- image | text | other
      storage_path TEXT NOT NULL,                    -- relative to the uploads dir
      uploaded_by  TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Runtime key/value config (Anthropic API key, model, …) — editable in the Settings screen.
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Betting tables: a persisted, collaborative deliberation. Members vote; the owner validates
    -- → it produces/activates a hill and bets the selected features.
    CREATE TABLE IF NOT EXISTS betting_tables (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'open',     -- open | validated | cancelled
      owner_id     TEXT REFERENCES users(id),
      owner_name   TEXT,
      hill_id      TEXT REFERENCES hills(id),        -- produced cycle; null until validated
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      validated_at TEXT,
      validated_by TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Frozen menu snapshot (denormalized so the table renders stably as features change).
    CREATE TABLE IF NOT EXISTS betting_candidates (
      id                TEXT PRIMARY KEY,
      table_id          TEXT NOT NULL REFERENCES betting_tables(id),
      feature_id        TEXT NOT NULL REFERENCES features(id),
      theme             TEXT,
      score             REAL,
      title_snap        TEXT NOT NULL,
      problem_snap      TEXT,
      appetite_snap     TEXT,
      signal_count_snap INTEGER,
      selected          INTEGER NOT NULL DEFAULT 0,  -- owner's final pick at validation
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(table_id, feature_id)
    );

    -- One vote per (candidate, voter); toggling = delete + insert.
    CREATE TABLE IF NOT EXISTS betting_votes (
      id           TEXT PRIMARY KEY,
      table_id     TEXT NOT NULL REFERENCES betting_tables(id),
      candidate_id TEXT NOT NULL REFERENCES betting_candidates(id),
      voter_name   TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(table_id, candidate_id, voter_name)
    );

    -- Append-only betting-table audit (who did what, when) — mirrors feature_events.
    CREATE TABLE IF NOT EXISTS betting_events (
      seq        INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id   TEXT NOT NULL REFERENCES betting_tables(id),
      actor      TEXT NOT NULL,
      actor_type TEXT NOT NULL DEFAULT 'user',
      action     TEXT NOT NULL,                      -- generated | vote_cast | vote_cleared | validated | cancelled
      summary    TEXT NOT NULL,
      detail     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS betting_votes_by_table ON betting_votes (table_id, candidate_id);
    CREATE INDEX IF NOT EXISTS betting_cands_by_table ON betting_candidates (table_id);

    -- Conversational intake session (state lives here, not a definitive write)
    CREATE TABLE IF NOT EXISTS intake_session (
      id          TEXT PRIMARY KEY,
      state       TEXT NOT NULL DEFAULT 'gather',    -- gather | clarify | reflect | propose | committed | pending_review
      turns       INTEGER NOT NULL DEFAULT 0,
      data        TEXT NOT NULL,                     -- JSON: raw input, transcript, proposal, candidates
      committed   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS feedback_by_feature ON feedback (feature_id);
    CREATE INDEX IF NOT EXISTS feedback_by_hash    ON feedback (content_hash);
    CREATE INDEX IF NOT EXISTS features_by_status  ON features (status, stale);
    CREATE INDEX IF NOT EXISTS decisions_by_feature ON decisions (feature_id, decided_at);
    CREATE INDEX IF NOT EXISTS routing_by_feedback  ON routing_log (feedback_id, created_at);
    CREATE INDEX IF NOT EXISTS attachments_by_feature  ON attachments (feature_id);
    CREATE INDEX IF NOT EXISTS attachments_by_feedback ON attachments (feedback_id);
  `)

  // Migrations: add new columns to existing tables (idempotent). New TABLES go in the exec above.
  // A new feature iteration links back to the shipped feature it supersedes (no reopening 'done').
  addColumnIfMissing('features', 'supersedes_id', 'supersedes_id TEXT REFERENCES features(id)')

  _ready = true
}
