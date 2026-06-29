import type { H3Event } from 'h3'

/** Require an authenticated OWNER for admin actions (invite, remove, change role). */
export async function requireOwner(event: H3Event) {
  const { user } = await requireUserSession(event)
  if (user.role !== 'owner') throw createError({ statusCode: 403, statusMessage: "Réservé à l'owner du workspace" })
  return user
}
