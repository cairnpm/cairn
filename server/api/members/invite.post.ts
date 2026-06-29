import { ensureSchema } from '~~/server/db/schema'
import { createInvitation } from '~~/server/db/invitations'

// Owner creates an invite for an email → returns a shareable join link (copy it into Slack/email).
export default defineEventHandler(async (event) => {
  ensureSchema()
  const owner = await requireOwner(event)
  const body = await readBody(event)
  const email = typeof body?.email === 'string' ? body.email : ''
  const role: 'owner' | 'member' = body?.role === 'owner' ? 'owner' : 'member'
  const res = createInvitation(email, role, owner.id)
  if ('error' in res) throw createError({ statusCode: 400, statusMessage: res.error })
  const url = `${getRequestURL(event).origin}/join/${res.token}`
  return { ok: true, url, email: res.email, role: res.role }
})
