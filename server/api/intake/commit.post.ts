import { intakeCommit } from '~~/server/gateway/intake'

export default defineAuthedHandler(async (event, { actor }) => {
  const body = await readBody(event)
  const sessionId = typeof body?.session_id === 'string' ? body.session_id : ''
  if (!sessionId) throw createError({ statusCode: 400, statusMessage: 'session_id is required' })
  return intakeCommit(sessionId, actor)
})
