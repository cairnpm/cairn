import { intakeTurn } from '~~/server/gateway/intake'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const message = typeof body?.message === 'string' ? body.message : ''
  if (!message.trim()) throw createError({ statusCode: 400, statusMessage: 'message is required' })

  const sessionId = typeof body?.session_id === 'string' ? body.session_id : null
  const source = typeof body?.source === 'string' ? body.source : 'manual'
  const attachmentIds = Array.isArray(body?.attachment_ids) ? body.attachment_ids.filter((x: unknown) => typeof x === 'string') : []
  // Attribution comes from the authenticated session, never the request body.
  const { user } = await requireUserSession(event)

  return intakeTurn(sessionId, message, source, user.name as string, attachmentIds)
})
