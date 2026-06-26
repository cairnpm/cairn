// Single choke point: every /api/** route requires a session, so attribution can't be spoofed
// via request bodies. Exemptions: the login route, nuxt-auth-utils' own session endpoint, and
// the external GitHub webhook (authenticated separately by signature — TODO).
const PUBLIC = [/^\/api\/auth\//, /^\/api\/_auth\//, /^\/api\/github\//]

export default defineEventHandler(async (event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/')) return
  if (PUBLIC.some(re => re.test(path))) return
  await requireUserSession(event)
})
