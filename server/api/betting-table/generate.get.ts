import { all, get } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'
import type { Feature } from '~~/server/domain/types'
import { cosine, decodeEmbedding } from '~~/server/utils/embedding'

const CLUSTER_THRESHOLD = 0.4

// On-demand betting-table generation. Returns a RANKED MENU, never a decision.
export default defineEventHandler((event) => {
  ensureSchema()
  const now = Date.now()

  const features = all<Feature>(`SELECT * FROM features WHERE status = 'shaped'`)

  const scored = features.map((f) => {
    const ageDays = (now - Date.parse(f.updated_at)) / 86_400_000
    const recency = Math.exp(-ageDays / 21) // ~3-week half-life
    const appetite = f.appetite === 'big' ? 1.3 : 1
    const lastDecision = get<{ verdict: string }>('SELECT verdict FROM decisions WHERE feature_id = ? ORDER BY decided_at DESC LIMIT 1', f.id)
    const deferPenalty = lastDecision?.verdict === 'defer' ? 0.8 : lastDecision?.verdict === 'pass' ? 0.5 : 1
    const stalePenalty = f.stale ? 0.6 : 1
    const score = (1 + f.signal_count) * recency * appetite * deferPenalty * stalePenalty
    return { feature: f, embedding: decodeEmbedding(f.embedding), score, ageDays: Math.round(ageDays) }
  }).sort((a, b) => b.score - a.score)

  // Greedy thematic clustering on embeddings → the "high view" mirror.
  interface Cluster { theme: string; seed: number[]; items: typeof scored }
  const clusters: Cluster[] = []
  for (const s of scored) {
    const hit = clusters.find(c => cosine(c.seed, s.embedding) >= CLUSTER_THRESHOLD)
    if (hit) hit.items.push(s)
    else clusters.push({ theme: s.feature.title, seed: s.embedding, items: [s] })
  }

  const menu = clusters
    .map(c => ({
      theme: c.theme,
      score: c.items.reduce((sum, i) => sum + i.score, 0),
      candidates: c.items.map(i => ({
        feature_id: i.feature.id,
        title: i.feature.title,
        problem: i.feature.problem,
        appetite: i.feature.appetite,
        signal_count: i.feature.signal_count,
        age_days: i.ageDays,
        score: Number(i.score.toFixed(2)),
      })),
    }))
    .sort((a, b) => b.score - a.score)

  return {
    generated_at: new Date(now).toISOString(),
    total_candidates: scored.length,
    theme_count: clusters.length,
    menu,
  }
})
