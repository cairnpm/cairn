import type { H3Event } from 'h3'

// Auth is already enforced globally by server/middleware/auth.ts, and the schema is created once at
// boot by server/plugins/init.ts. So endpoints don't need to re-run ensureSchema() or re-guard auth —
// they only need to *read* the session user. These wrappers inject { user, actor } so that stops
// being copy-pasted, and actorName() makes the attribution fallback consistent.

type SessionUser = Awaited<ReturnType<typeof requireUserSession>>['user']
type Ctx = { user: SessionUser; actor: string }

/** Attribution name from the session (never the request body). One canonical fallback. */
export function actorName(user: { name?: unknown } | null | undefined): string {
  return (user?.name as string) || 'inconnu'
}

/** Handler that needs the authenticated user — injects { user, actor }. */
export function defineAuthedHandler<T>(handler: (event: H3Event, ctx: Ctx) => T) {
  return defineEventHandler(async (event) => {
    const { user } = await requireUserSession(event)
    return handler(event, { user, actor: actorName(user) })
  })
}

/** Like defineAuthedHandler but 403s non-owners (admin actions). */
export function defineOwnerHandler<T>(handler: (event: H3Event, ctx: Ctx) => T) {
  return defineEventHandler(async (event) => {
    const { user } = await requireUserSession(event)
    if (user.role !== 'owner') throw createError({ statusCode: 403, statusMessage: "Réservé à l'owner du workspace" })
    return handler(event, { user, actor: actorName(user) })
  })
}
