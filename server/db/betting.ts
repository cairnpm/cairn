import { all, get, run } from './client'

export type BettingAction = 'generated' | 'vote_cast' | 'vote_cleared' | 'validated' | 'cancelled' | 'deleted' | 'restored'

export function logBettingEvent(
  tableId: string, actor: string | null, action: BettingAction, summary: string,
  detail?: Record<string, unknown>, actorType: 'user' | 'system' = 'user',
): void {
  run(
    `INSERT INTO betting_events (table_id, actor, actor_type, action, summary, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    tableId, actor || 'inconnu', actorType, action, summary, detail ? JSON.stringify(detail) : null,
  )
}

export interface BettingTableRow {
  id: string; title: string; status: string; owner_name: string | null
  hill_id: string | null; generated_at: string; validated_at: string | null; validated_by: string | null
}

/** List of tables with progress counters (candidates, distinct voters, votes). */
export function listBettingTables() {
  return all<BettingTableRow & { candidate_count: number; voter_count: number; vote_count: number }>(
    `SELECT t.*,
            (SELECT COUNT(*) FROM betting_candidates c WHERE c.table_id = t.id)               AS candidate_count,
            (SELECT COUNT(DISTINCT v.voter_name) FROM betting_votes v WHERE v.table_id = t.id) AS voter_count,
            (SELECT COUNT(*) FROM betting_votes v WHERE v.table_id = t.id)                     AS vote_count
     FROM betting_tables t ORDER BY t.created_at DESC`,
  )
}

export function getBettingTable(id: string): BettingTableRow | undefined {
  return get<BettingTableRow>('SELECT * FROM betting_tables WHERE id = ?', id)
}

/** Candidates with their vote tally + voter names (for avatars). */
export function tableCandidates(tableId: string) {
  const rows = all<{ id: string; feature_id: string; theme: string | null; score: number; title_snap: string; problem_snap: string | null; appetite_snap: string | null; signal_count_snap: number; selected: number }>(
    'SELECT id, feature_id, theme, score, title_snap, problem_snap, appetite_snap, signal_count_snap, selected FROM betting_candidates WHERE table_id = ? ORDER BY score DESC', tableId,
  )
  return rows.map(c => ({
    ...c,
    voters: all<{ voter_name: string }>('SELECT voter_name FROM betting_votes WHERE candidate_id = ? ORDER BY created_at', c.id).map(v => v.voter_name),
  }))
}

export function tableEvents(tableId: string) {
  return all('SELECT seq, actor, actor_type, action, summary, detail, created_at FROM betting_events WHERE table_id = ? ORDER BY seq DESC', tableId)
}
