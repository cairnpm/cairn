// ── Entities ───────────────────────────────────────────────────────────────
// UI locale (cookie `bike-lang`) — drives the language the LLM writes its user-facing output in.
export type UiLang = 'fr' | 'en' | 'es'
export type Classification = 'musing' | 'explore' | 'directive'
export type FeedbackStatus = 'new' | 'routed' | 'pending_review' | 'archived'
export type FeatureStatus = 'raw' | 'shaped' | 'bet' | 'building' | 'done' | 'archived'
export type Appetite = 'small' | 'big'
export type HillStatus = 'planned' | 'active' | 'closed'
export type Verdict = 'bet' | 'pass' | 'defer'
export type RoutingAction = 'create_feature' | 'append' | 'merge' | 'discard' | 'pending'

export interface Feedback {
  id: string
  content: string
  source: string
  captured_by: string | null
  classification: Classification
  status: FeedbackStatus
  feature_id: string | null
  content_hash: string | null
  embedding: string | null
  created_at: string
}

export interface Feature {
  id: string
  title: string
  problem: string
  appetite: Appetite | null
  solution: string | null
  rabbit_holes: string | null
  out_of_bounds: string | null
  status: FeatureStatus
  stale: number
  hill_id: string | null
  signal_count: number
  embedding: string | null
  created_at: string
  updated_at: string
}

export interface Hill {
  id: string
  name: string
  starts_at: string | null
  ends_at: string | null
  status: HillStatus
  created_at: string
}

export interface Decision {
  id: string
  feature_id: string
  hill_id: string | null
  verdict: Verdict
  appetite: Appetite | null
  rationale: string
  decided_by: string | null
  decided_at: string
}

export interface PrLink {
  id: string
  feature_id: string
  repo: string
  pr_number: number
  pr_url: string
  status: 'open' | 'merged' | 'closed'
  auto_close: number
  linked_at: string
  closed_at: string | null
}

// ── Intake conversation ──────────────────────────────────────────────────────
export type IntakeMode = 'signal' | 'query' | 'refine' | 'merge'
export type IntakeState = 'gather' | 'clarify' | 'reflect' | 'propose' | 'committed' | 'pending_review' | 'answered' | 'batch_clarify' | 'batch_review'
export interface Intent { intent: IntakeMode; target: string | null; target2?: string | null }

// Triage: does this input describe ONE shapeable problem (→ clarify into 1 feature) or SEVERAL
// (→ offer decomposition)? Shape Up: one pitch = one bounded problem. Length is irrelevant; the
// count of distinct, independently-shapeable problems is what decides.
export interface Triage { mode: 'single' | 'multi'; count: number; reason: string }

// A discrete product signal carved out of a transcript/dense input, recontextualized into a
// standalone problem so the normal routing (embed → candidates → propose) applies per segment.
// The guided-clarify question is decided per segment by propose (which has the focused code +
// candidates), NOT here — decompose only splits and shapes.
export interface DecomposedSignal { title: string; problem: string; classification: Classification }

export interface Candidate {
  feature_id: string
  title: string
  similarity: number
}

export interface ProposedSpec {
  title: string
  problem: string
  appetite: Appetite
  solution: string
  rabbit_holes: string
  out_of_bounds: string
}

export interface Proposal {
  action: Exclude<RoutingAction, 'pending'>
  target_feature_id: string | null
  merge_from_feature_id?: string | null   // for action='merge': the absorbed feature
  supersedes_id?: string | null           // new iteration of a shipped/archived feature
  classification: Classification
  confidence: number
  rationale: string
  proposed_spec: ProposedSpec
  // Concise 1-2 sentence reformulation of the RAW signal — stored as the logged feedback (the raw paste
  // is not kept; the detail lives in proposed_spec). The essence of what this signal asks/reports.
  signal_summary: string
  // A targeted human-judgment question when the signal is under-specified on an axis the code/candidates
  // can't resolve (else null). Drives guided clarify in the decompose/batch flow. Ignored in single mode.
  clarifying_question?: string | null
  candidates: Candidate[]
}

export interface TranscriptEntry { role: 'user' | 'agent'; text: string }

export interface IntakeSessionData {
  raw: string                 // the original brut input
  source: string
  captured_by: string | null
  mode: IntakeMode
  target_feature_id: string | null   // pinned target for `refine`
  merge_from_id: string | null       // absorbed feature for `merge`
  initial_action: string | null      // agent's first proposed action (quality metric)
  initial_target: string | null      // agent's first proposed target (quality metric)
  transcript: TranscriptEntry[]
  proposal: Proposal | null
  candidates: Candidate[]
  attachment_ids: string[]            // files uploaded with the first turn, linked at commit
  triage?: Triage | null             // first-turn triage result (drives single vs decompose offer)
  batch?: BatchSession | null        // present once decomposed: the N segments under review
  lang?: UiLang                      // UI locale captured on the first turn — the LLM writes output in it
}

// A reviewable segment from decomposition: the carved signal + its routed proposal + include flag.
export interface BatchSegment {
  id: string
  signal: DecomposedSignal
  proposal: Proposal
  include: boolean
  duplicate_of?: string | null       // another segment id this likely duplicates (UI hint)
  clarifying_question?: string | null // agent's targeted question while this segment is unresolved
  answer?: string | null             // the human's answer (folded back into shaping + routing)
}
// clarify_order: ids of the segments the AGENT decided need precision, asked one by one in chat.
// cursor: index into clarify_order of the segment currently being clarified.
export interface BatchSession { source: string; segments: BatchSegment[]; clarify_order: string[]; cursor: number }

export interface TurnResponse {
  session_id: string
  state: IntakeState
  agent_message: string
  proposal: Proposal | null
  // Set when the agent decided the input covers several problems and auto-decomposed it for review.
  batch?: { session_id: string; segments: BatchSegment[] }
}
