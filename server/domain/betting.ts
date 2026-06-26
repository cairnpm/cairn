import { all, get } from '../db/client'
import type { Feature } from './types'
import { cosine, decodeEmbedding } from '../utils/embedding'

const CLUSTER_THRESHOLD = 0.4

export interface MenuCandidate {
  feature_id: string
  title: string
  problem: string
  appetite: string | null
  signal_count: number
  age_days: number
  score: number
  theme: string
}

// Score + thematically cluster the shaped backlog into a ranked betting menu. Shared by the
// live preview and the persisted table snapshot (so both rank identically).
export function computeMenu(now = Date.now()): MenuCandidate[] {
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

  // Greedy thematic clustering on embeddings → a theme per candidate.
  interface Cluster { theme: string; seed: number[]; items: typeof scored }
  const clusters: Cluster[] = []
  for (const s of scored) {
    const hit = clusters.find(c => cosine(c.seed, s.embedding) >= CLUSTER_THRESHOLD)
    if (hit) hit.items.push(s)
    else clusters.push({ theme: s.feature.title, seed: s.embedding, items: [s] })
  }

  return clusters.flatMap(c => c.items.map(i => ({
    feature_id: i.feature.id,
    title: i.feature.title,
    problem: i.feature.problem,
    appetite: i.feature.appetite,
    signal_count: i.feature.signal_count,
    age_days: i.ageDays,
    score: Number(i.score.toFixed(2)),
    theme: c.theme,
  })))
}
