import { getResumableSession } from '~~/server/gateway/intake'
import { purgeIntakeSessions } from '~~/server/db/purgeIntake'

// Resume an in-progress intake: the whole conversation lives in the session row; the client only kept
// the id in localStorage. Ownership + committed guards live in getResumableSession.
export default defineAuthedHandler(async (event, { actor }) => {
  purgeIntakeSessions() // throttled (~6h) — this low-frequency read is a good place to sweep the table.
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id requis' })
  return getResumableSession(id, actor)
})
