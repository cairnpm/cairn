import { all, get, run, tx } from '~~/server/db/client'
import { getBettingTable, logBettingEvent } from '~~/server/db/betting'
import { recordDecision } from '~~/server/domain/bet'
import { newId } from '~~/server/utils/id'

// Owner validates a table → creates a hill (cycle) and bets the selected, still-shaped features.
// A feature that changed status since the snapshot (done/bet/archived/merged) is skipped, not reopened.
export default defineAuthedHandler(async (event, { user, actor }) => {
  if (user.role !== 'owner') throw createError({ statusCode: 403, statusMessage: 'Seul l\'owner peut valider une betting table' })

  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const hillName = (typeof body?.hill_name === 'string' && body.hill_name.trim()) || ''
  const startsAt = typeof body?.starts_at === 'string' ? body.starts_at : null
  const endsAt = typeof body?.ends_at === 'string' ? body.ends_at : null
  const rationale = (typeof body?.rationale === 'string' && body.rationale.trim()) || ''
  if (!hillName) throw createError({ statusCode: 400, statusMessage: 'hill_name requis' })

  const table = getBettingTable(id)
  if (!table) throw createError({ statusCode: 404, statusMessage: 'Betting table not found' })
  if (table.status !== 'open') throw createError({ statusCode: 409, statusMessage: 'Table déjà close' })

  // Final selection: explicit ids, else every candidate that received ≥1 vote.
  const explicit: string[] = Array.isArray(body?.selected_ids) ? body.selected_ids.filter((x: unknown) => typeof x === 'string') : []
  const candidates = all<{ id: string, feature_id: string, title_snap: string }>('SELECT id, feature_id, title_snap FROM betting_candidates WHERE table_id = ?', id)
  const votedIds = new Set(all<{ candidate_id: string }>('SELECT DISTINCT candidate_id FROM betting_votes WHERE table_id = ?', id).map(v => v.candidate_id))
  const selected = candidates.filter(c => (explicit.length ? explicit.includes(c.id) : votedIds.has(c.id)))

  const hillId = newId()
  const bet: string[] = []
  const skipped: { title: string, status: string }[] = []

  tx(() => {
    run(
      `INSERT INTO hills (id, name, starts_at, ends_at, status, created_at) VALUES (?, ?, ?, ?, 'active', datetime('now'))`,
      hillId, hillName, startsAt, endsAt,
    )
    for (const c of selected) {
      run('UPDATE betting_candidates SET selected = 1 WHERE id = ?', c.id)
      const f = get<{ status: string }>('SELECT status FROM features WHERE id = ?', c.feature_id)
      if (f?.status === 'shaped') {
        recordDecision({ featureId: c.feature_id, verdict: 'bet', hillId, rationale: rationale || `Parié via la betting table « ${table.title} »`, decidedBy: actor })
        bet.push(c.title_snap)
      } else {
        skipped.push({ title: c.title_snap, status: f?.status ?? 'introuvable' })
      }
    }
    run(
      `UPDATE betting_tables SET status = 'validated', hill_id = ?, validated_at = datetime('now'), validated_by = ? WHERE id = ?`,
      hillId, actor, id,
    )
    logBettingEvent(id, actor, 'validated', `Validée par ${actor} → hill « ${hillName} » · ${bet.length} pari(s)`, { hill_id: hillId, bet, skipped })
  })

  return { ok: true, hill_id: hillId, bet, skipped }
})
