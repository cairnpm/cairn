import { intakeTurn } from '~~/server/gateway/intake'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const message = typeof body?.message === 'string' ? body.message : ''
  if (!message.trim()) throw createError({ statusCode: 400, statusMessage: 'message is required' })

  const sessionId = typeof body?.session_id === 'string' ? body.session_id : null
  const source = typeof body?.source === 'string' ? body.source : 'manual'
  const capturedBy = typeof body?.captured_by === 'string' ? body.captured_by : null

  return intakeTurn(sessionId, message, source, capturedBy)
})
