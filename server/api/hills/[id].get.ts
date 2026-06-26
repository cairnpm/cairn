import { all, get } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'

// Hill detail: the cycle + its bet features, each with PR links and the decision that bet it.
export default defineEventHandler((event) => {
  ensureSchema()
  const id = getRouterParam(event, 'id')!

  const hill = get<{ id: string }>('SELECT id, name, starts_at, ends_at, status, created_at FROM hills WHERE id = ?', id)
  if (!hill) throw createError({ statusCode: 404, statusMessage: 'Hill not found' })

  // The betting table that produced this hill (why it exists), if any.
  const betting_table = get(
    'SELECT id, title, validated_by, validated_at FROM betting_tables WHERE hill_id = ? ORDER BY validated_at DESC LIMIT 1', id,
  )

  const features = all<{ id: string, title: string, status: string }>(
    `SELECT id, title, status FROM features WHERE hill_id = ? AND status IN ('bet','building','done') ORDER BY updated_at DESC`,
    id,
  ).map(f => ({
    ...f,
    pr_links: all('SELECT repo, pr_number, pr_url, status, auto_close FROM pr_links WHERE feature_id = ?', f.id),
    decision: get('SELECT verdict, rationale, decided_by, decided_at FROM decisions WHERE feature_id = ? AND verdict = \'bet\' ORDER BY decided_at DESC LIMIT 1', f.id),
  }))

  return { hill, features, betting_table }
})
