// ── Entities ───────────────────────────────────────────────────────────────
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
export type IntakeState = 'gather' | 'clarify' | 'reflect' | 'propose' | 'committed' | 'pending_review' | 'answered'
export interface Intent { intent: IntakeMode; target: string | null; target2?: string | null }

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
}

export interface TurnResponse {
  session_id: string
  state: IntakeState
  agent_message: string
  proposal: Proposal | null
}
