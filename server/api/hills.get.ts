import { all } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'

interface HillRow {
  id: string; name: string; starts_at: string | null; ends_at: string | null
  status: string; total: number; done: number
}

export default defineEventHandler(() => {
  ensureSchema()
  return all<HillRow>(
    `SELECT h.id, h.name, h.starts_at, h.ends_at, h.status,
            COUNT(f.id) AS total,
            COALESCE(SUM(CASE WHEN f.status = 'done' THEN 1 ELSE 0 END), 0) AS done
     FROM hills h
     LEFT JOIN features f ON f.hill_id = h.id AND f.status IN ('bet','building','done')
     GROUP BY h.id
     ORDER BY h.starts_at DESC`,
  )
})
