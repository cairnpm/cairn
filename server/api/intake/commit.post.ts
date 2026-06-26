import { intakeCommit } from '~~/server/gateway/intake'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const sessionId = typeof body?.session_id === 'string' ? body.session_id : ''
  if (!sessionId) throw createError({ statusCode: 400, statusMessage: 'session_id is required' })
  const { user } = await requireUserSession(event)
  return intakeCommit(sessionId, user.name as string)
})
