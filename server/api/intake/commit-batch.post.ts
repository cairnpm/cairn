import { commitBatch, type BatchSelection } from '~~/server/gateway/intake'

// Commit the selected segments of a batch decomposition session.
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const sessionId = typeof body?.session_id === 'string' ? body.session_id : ''
  if (!sessionId) throw createError({ statusCode: 400, statusMessage: 'session_id is required' })
  const segments: BatchSelection[] = Array.isArray(body?.segments)
    ? body.segments.filter((s: unknown) => s && typeof (s as BatchSelection).id === 'string')
    : []
  const { user } = await requireUserSession(event)
  return commitBatch(sessionId, segments, user.name as string)
})
