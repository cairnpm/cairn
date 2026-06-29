import { all, get } from '~~/server/db/client'
import { listAssignees } from '~~/server/db/assignees'

// Hill detail: the cycle + its bet features, each with PR links and the decision that bet it.
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!

  const hill = get<{ id: string }>('SELECT id, name, starts_at, ends_at, status, created_at FROM hills WHERE id = ?', id)
  if (!hill) throw createError({ statusCode: 404, statusMessage: 'Hill not found' })

  // The cycle's "why": the rationale shared by most of its bet decisions (i.e. the validation rationale).
  const rationale = get<{ rationale: string }>(
    `SELECT rationale, COUNT(*) AS c FROM decisions
     WHERE hill_id = ? AND verdict = 'bet' AND rationale IS NOT NULL AND rationale != ''
     GROUP BY rationale ORDER BY c DESC, decided_at ASC LIMIT 1`, id,
  )?.rationale ?? null

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
    builders: listAssignees(f.id).filter(a => a.role === 'builder').map(a => ({ user_id: a.user_id, name: a.name, avatar_url: a.avatar_url })),
  }))

  return { hill: { ...hill, rationale }, features, betting_table }
})
