import { db } from './client'

let _ready = false

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
  `)
  _ready = true
}
