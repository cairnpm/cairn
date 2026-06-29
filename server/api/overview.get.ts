import { all, get } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'
import { getSetting } from '~~/server/db/settings'

// Sidebar overview: nav counts, recent activity feed, and the live model — one cheap call.
export default defineEventHandler(() => {
  ensureSchema()

  const counts = get<{ total: number, shaped: number, bet: number, building: number, done: number }>(
    `SELECT COUNT(*) AS total,
            SUM(status='shaped') AS shaped, SUM(status='bet') AS bet,
            SUM(status='building') AS building, SUM(status='done') AS done
     FROM features WHERE status NOT IN ('archived', 'deleted')`,
  )
  const hillsActive = get<{ n: number }>(`SELECT COUNT(*) AS n FROM hills WHERE status IN ('active','planned')`)?.n ?? 0
  const bettingTotal = get<{ n: number }>(`SELECT COUNT(*) AS n FROM betting_tables WHERE status NOT IN ('cancelled', 'deleted')`)?.n ?? 0

  const activity = all<{ action: string, summary: string, actor: string, created_at: string, title: string }>(
    `SELECT e.action, e.summary, e.actor, e.created_at, f.title
     FROM feature_events e JOIN features f ON f.id = e.feature_id
     ORDER BY e.seq DESC LIMIT 5`,
  )

  return {
    features_total: counts?.total ?? 0,
    by_status: { shaped: counts?.shaped ?? 0, bet: counts?.bet ?? 0, building: counts?.building ?? 0, done: counts?.done ?? 0 },
    hills_active: hillsActive,
    betting_total: bettingTotal,
    workspace_name: getSetting('workspace_name') ?? 'Cairn',
    workspace_logo: getSetting('workspace_logo') ?? null,
    model: getSetting('anthropic_model') ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    activity,
  }
})
