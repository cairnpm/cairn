import { all, get } from './client'
import { BETTING_EVENTS, listActivity, logActivity } from './activity'

export type BettingAction = 'generated' | 'vote_cast' | 'vote_cleared' | 'validated' | 'cancelled' | 'deleted' | 'restored'

export function logBettingEvent(
  tableId: string, actor: string | null, action: BettingAction, summary: string,
  detail?: Record<string, unknown>, actorType: 'user' | 'system' = 'user',
): void {
  logActivity(BETTING_EVENTS, tableId, actor, action, summary, detail, actorType)
}

export interface BettingTableRow {
  id: string; title: string; status: string; owner_name: string | null; owner_avatar: string | null
  hill_id: string | null; generated_at: string; validated_at: string | null; validated_by: string | null
}

// The owner is a LIVE reference: resolve its current name + avatar via the owner_id FK (so a rename
// follows everywhere). owner_name in the row stays as the point-in-time snapshot for fallback only.
const OWNER_JOIN = 'LEFT JOIN users u ON u.id = t.owner_id'
const OWNER_COLS = 'u.name AS owner_live, u.avatar_url AS owner_avatar'
function resolveOwner<T extends { owner_live?: string | null; owner_name: string | null }>(r: T) {
  const { owner_live, ...rest } = r
  return { ...rest, owner_name: owner_live ?? rest.owner_name } as Omit<T, 'owner_live'>
}

/** List of tables with progress counters (candidates, distinct voters, votes) + hill + live owner. */
export function listBettingTables() {
  return all<BettingTableRow & { owner_live: string | null; hill_name: string | null; candidate_count: number; voter_count: number; vote_count: number }>(
    `SELECT t.*, h.name AS hill_name, ${OWNER_COLS},
            (SELECT COUNT(*) FROM betting_candidates c WHERE c.table_id = t.id)               AS candidate_count,
            (SELECT COUNT(DISTINCT v.voter_name) FROM betting_votes v WHERE v.table_id = t.id) AS voter_count,
            (SELECT COUNT(*) FROM betting_votes v WHERE v.table_id = t.id)                     AS vote_count
     FROM betting_tables t LEFT JOIN hills h ON h.id = t.hill_id ${OWNER_JOIN} ORDER BY t.created_at DESC`,
  ).map(resolveOwner)
}

export function getBettingTable(id: string): (BettingTableRow & { hill_name: string | null }) | undefined {
  const r = get<BettingTableRow & { owner_live: string | null; hill_name: string | null }>(
    `SELECT t.*, h.name AS hill_name, ${OWNER_COLS} FROM betting_tables t LEFT JOIN hills h ON h.id = t.hill_id ${OWNER_JOIN} WHERE t.id = ?`,
    id,
  )
  return r ? resolveOwner(r) : undefined
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
  return listActivity(BETTING_EVENTS, tableId)
}
