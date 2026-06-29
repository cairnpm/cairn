import { run, tx } from '~~/server/db/client'
import { markStaleFeatures } from '~~/server/db/stale'
import { logBettingEvent } from '~~/server/db/betting'
import { computeMenu } from '~~/server/domain/betting'
import { newId } from '~~/server/utils/id'

// Snapshot the current ranked menu into a persistent, votable betting table.
export default defineAuthedHandler(async (event, { user, actor }) => {
  markStaleFeatures()
  const body = await readBody(event)
  const title = (typeof body?.title === 'string' && body.title.trim()) || `Betting table — ${new Date().toISOString().slice(0, 10)}`

  const menu = computeMenu()
  const tableId = newId()

  tx(() => {
    run(
      `INSERT INTO betting_tables (id, title, status, owner_id, owner_name, generated_at, created_at)
       VALUES (?, ?, 'open', ?, ?, datetime('now'), datetime('now'))`,
      tableId, title, user.id, actor,
    )
    for (const c of menu) {
      run(
        `INSERT INTO betting_candidates (id, table_id, feature_id, theme, score, title_snap, problem_snap, appetite_snap, signal_count_snap, selected, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
        newId(), tableId, c.feature_id, c.theme, c.score, c.title, c.problem, c.appetite, c.signal_count,
      )
    }
    logBettingEvent(tableId, actor, 'generated', `Table générée par ${actor} — ${menu.length} candidat(s)`, { candidates: menu.length })
  })

  return { id: tableId, title, candidate_count: menu.length }
})
