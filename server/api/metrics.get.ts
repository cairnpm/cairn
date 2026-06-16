import { all, get } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'

// Agent quality metric (brief agent §6): rate of routing decisions the human corrected.
// Built from routing_log — the free eval dataset.
export default defineEventHandler(() => {
  ensureSchema()
  const totals = get<{ total: number, corrected: number }>(
    'SELECT COUNT(*) AS total, COALESCE(SUM(corrected), 0) AS corrected FROM routing_log',
  )
  const byAction = all<{ action: string, total: number, corrected: number }>(
    'SELECT action, COUNT(*) AS total, COALESCE(SUM(corrected), 0) AS corrected FROM routing_log GROUP BY action',
  )
  const total = totals?.total ?? 0
  const corrected = totals?.corrected ?? 0
  return {
    total,
    corrected,
    correction_rate: total ? Number((corrected / total).toFixed(3)) : 0,
    by_action: byAction,
  }
})
