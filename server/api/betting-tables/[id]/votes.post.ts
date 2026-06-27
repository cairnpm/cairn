import { get, run, tx } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'
import { getBettingTable, logBettingEvent } from '~~/server/db/betting'
import { newId } from '~~/server/utils/id'

// Toggle the session user's vote for a candidate.
export default defineEventHandler(async (event) => {
  ensureSchema()
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const candidateId = typeof body?.candidate_id === 'string' ? body.candidate_id : ''

  const table = getBettingTable(id)
  if (!table) throw createError({ statusCode: 404, statusMessage: 'Betting table not found' })
  if (table.status !== 'open') throw createError({ statusCode: 409, statusMessage: 'Table close — vote impossible' })

  const cand = get<{ id: string, title_snap: string }>('SELECT id, title_snap FROM betting_candidates WHERE id = ? AND table_id = ?', candidateId, id)
  if (!cand) throw createError({ statusCode: 404, statusMessage: 'Candidate not found' })

  // Identity is the stable user id (renames don't create a second vote); voter_name is kept for display.
  const existing = get<{ id: string }>('SELECT id FROM betting_votes WHERE table_id = ? AND candidate_id = ? AND voter_id = ?', id, candidateId, user.id)
  let voted: boolean
  tx(() => {
    if (existing) {
      run('DELETE FROM betting_votes WHERE id = ?', existing.id)
      voted = false
      logBettingEvent(id, user.name, 'vote_cleared', `${user.name} a retiré son vote sur « ${cand.title_snap} »`, { candidate_id: candidateId })
    } else {
      run('INSERT INTO betting_votes (id, table_id, candidate_id, voter_id, voter_name, created_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))', newId(), id, candidateId, user.id, user.name)
      voted = true
      logBettingEvent(id, user.name, 'vote_cast', `${user.name} a voté pour « ${cand.title_snap} »`, { candidate_id: candidateId })
    }
  })
  return { ok: true, voted: voted! }
})
