import { get, run, tx } from './client'
import { logEvent } from './events'
import { encodeEmbedding, localEmbed } from '../utils/embedding'

// One-shot migration of an *existing/historical* roadmap (e.g. from Notion) into Cairn — the cycles
// that already happened and the features they delivered, with their signals. It writes the END STATE
// directly (no intake/betting replay): finished hills + delivered features + the feedback that drove
// them. Backlog/shaping features should NOT come through here — they go via the intake so it can
// triage/dedup. Idempotent by id (re-runnable), embeddings computed locally so dedup/search work.

const emb = (s: string) => encodeEmbedding(localEmbed(s))

export interface RoadmapHill {
  id: string
  name: string
  starts?: string | null
  ends?: string | null
  status?: 'planned' | 'active' | 'closed' // default 'closed' (this is history)
}

export interface RoadmapFeedback {
  content: string
  source?: string         // slack | email | call | manual | …
  classification?: string // explore | directive | musing | …
  captured_by?: string
}

export interface RoadmapFeature {
  id: string
  title: string
  problem: string         // mandatory in Cairn — what actually broke
  appetite?: 'small' | 'big' | null
  solution?: string
  rabbit_holes?: string
  out_of_bounds?: string
  status?: string         // default 'done' (delivered); 'building' for in-progress
  hill?: string | null    // the hill id it was delivered in
  at?: string | null      // delivery date (defaults to the hill's end, else now)
  feedback?: RoadmapFeedback[]
  decision?: { verdict?: string; rationale: string; by?: string }
  pr?: { repo: string; number: number; status?: string } // optional GitHub link for a shipped feature
}

export interface Roadmap {
  hills?: RoadmapHill[]
  features?: RoadmapFeature[]
}

export interface ImportSummary {
  hills: number; hillsSkipped: number
  features: number; featuresSkipped: number
  feedback: number; decisions: number; prs: number
}

export function importRoadmap(data: Roadmap, opts: { actor?: string } = {}): ImportSummary {
  const actor = opts.actor || 'Migration'
  const now = new Date().toISOString()
  const hills = data.hills ?? []
  const features = data.features ?? []
  const hillEnds = new Map(hills.map(h => [h.id, h.ends || now]))
  const s: ImportSummary = { hills: 0, hillsSkipped: 0, features: 0, featuresSkipped: 0, feedback: 0, decisions: 0, prs: 0 }

  tx(() => {
    for (const h of hills) {
      if (get('SELECT id FROM hills WHERE id = ?', h.id)) { s.hillsSkipped++; continue }
      run(
        'INSERT INTO hills (id, name, starts_at, ends_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        h.id, h.name, h.starts ?? null, h.ends ?? null, h.status || 'closed', h.starts || now,
      )
      s.hills++
    }

    for (const f of features) {
      if (get('SELECT id FROM features WHERE id = ?', f.id)) { s.featuresSkipped++; continue }
      const at = f.at || (f.hill ? hillEnds.get(f.hill) : null) || now
      const fb = f.feedback ?? []
      run(
        `INSERT INTO features (id, title, problem, appetite, solution, rabbit_holes, out_of_bounds, status, stale, hill_id, signal_count, embedding, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        f.id, f.title, f.problem, f.appetite ?? null, f.solution ?? '', f.rabbit_holes ?? '', f.out_of_bounds ?? '',
        f.status || 'done', f.hill ?? null, fb.length, emb(`${f.title} ${f.problem} ${f.solution ?? ''}`), at, at,
      )
      logEvent(f.id, actor, 'created', `Feature importée (${actor})`, { title: f.title }, 'system')
      s.features++

      fb.forEach((x, i) => {
        run(
          `INSERT INTO feedback (id, content, source, captured_by, classification, status, feature_id, content_hash, embedding, created_at)
           VALUES (?, ?, ?, ?, ?, 'routed', ?, ?, ?, ?)`,
          `imp-${f.id}-${i}`, x.content, x.source || 'manual', x.captured_by || actor, x.classification || 'explore',
          f.id, `import-${f.id}-${i}`, emb(x.content), at,
        )
        s.feedback++
      })

      if (f.decision) {
        run(
          `INSERT INTO decisions (id, feature_id, hill_id, verdict, appetite, rationale, decided_by, decided_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          `dec-${f.id}`, f.id, f.hill ?? null, f.decision.verdict || 'bet', f.appetite ?? null,
          f.decision.rationale, f.decision.by || actor, at,
        )
        s.decisions++
      }

      if (f.pr) {
        run(
          `INSERT INTO pr_links (id, feature_id, repo, pr_number, pr_url, status, auto_close, linked_at, closed_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          `pr-${f.id}`, f.id, f.pr.repo, f.pr.number, `https://github.com/${f.pr.repo}/pull/${f.pr.number}`,
          f.pr.status || 'merged', at, (f.pr.status || 'merged') === 'merged' ? at : null,
        )
        s.prs++
      }
    }
  })

  return s
}
