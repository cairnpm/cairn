import { intakeTurn } from '~~/server/gateway/intake'

export default defineAuthedHandler(async (event, { actor }) => {
  const body = await readBody(event)
  const message = typeof body?.message === 'string' ? body.message : ''
  const sessionId = typeof body?.session_id === 'string' ? body.session_id : null
  const source = typeof body?.source === 'string' ? body.source : 'manual'
  const attachmentIds = Array.isArray(body?.attachment_ids) ? body.attachment_ids.filter((x: unknown) => typeof x === 'string') : []
  // A turn needs either text or at least one attachment (e.g. a transcript dropped without a note).
  if (!message.trim() && !attachmentIds.length) throw createError({ statusCode: 400, statusMessage: 'message or attachment required' })
  // Output language follows the UI locale (cookie set by the client's language switcher; defaults to fr).
  const lang = getCookie(event, 'bike-lang') === 'en' ? 'en' : 'fr'
  // Attribution comes from the authenticated session, never the request body.
  return intakeTurn(sessionId, message, source, actor, attachmentIds, lang)
})
