export interface BettingCandidate {
  id: string; feature_id: string; score: number
  title_snap: string; problem_snap: string | null; appetite_snap: string | null
  signal_count_snap: number; selected: number; voters: string[]
}
export interface BettingEvent { seq: number; actor: string; action: string; summary: string; detail?: string | null; created_at: string }
export interface BettingTableDetailData {
  table: { id: string; title: string; status: string; owner_name: string | null; owner_avatar: string | null; hill_id: string | null; hill_name: string | null; validated_by: string | null }
  candidates: BettingCandidate[]
  events: BettingEvent[]
}
