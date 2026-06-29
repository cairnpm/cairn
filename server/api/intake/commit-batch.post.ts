import { commitBatch, type BatchSelection } from '~~/server/gateway/intake'

// Commit the selected segments of a batch decomposition session.
export default defineAuthedHandler(async (event, { actor }) => {
  const body = await readBody(event)
  const sessionId = typeof body?.session_id === 'string' ? body.session_id : ''
  if (!sessionId) throw createError({ statusCode: 400, statusMessage: 'session_id is required' })
  const segments: BatchSelection[] = Array.isArray(body?.segments)
    ? body.segments.filter((s: unknown) => s && typeof (s as BatchSelection).id === 'string')
    : []
  return commitBatch(sessionId, segments, actor)
})
