import { db, run } from '~~/server/db/client'

// DEV-ONLY destructive reset: wipes the product content (backlog / hills / feedback / decisions /
// betting / events / routing / intake sessions), keeping users, settings, invitations and attachments.
// Used to start from a clean slate before a roadmap import. Refuses to run outside dev.
const CONTENT_TABLES = [
  'feature_events', 'betting_events', 'betting_votes', 'betting_candidates', 'betting_tables',
  'pr_links', 'decisions', 'feature_assignees', 'routing_log', 'feedback', 'features', 'hills',
  'intake_session',
]

export default defineOwnerHandler(() => {
  if (!import.meta.dev) throw createError({ statusCode: 403, statusMessage: 'Disabled outside dev' })
  // FK off so we don't have to order the DELETEs perfectly; re-enabled right after.
  const d = db()
  d.exec('PRAGMA foreign_keys = OFF')
  try { for (const t of CONTENT_TABLES) run(`DELETE FROM ${t}`) }
  finally { d.exec('PRAGMA foreign_keys = ON') }
  return { ok: true, wiped: CONTENT_TABLES }
})
