import { all, get, run } from '../db/client'
import { logEvent } from '../db/events'
import { getSecret, getSetting } from '../db/settings'
import { githubInstallationToken } from './githubApp'
import { parseSpec } from './codeRepo'
import { newId } from './id'

// Write side of the GitHub link: a bet feature is materialised as a GitHub issue generated from the
// pitch (problem/appetite/solution/rabbit_holes/out_of_bounds + a Cairn backlink). We mint the issue
// via the App installation token (same path as the read-only clone), so there is no `gh` dependency
// and no write outside the one write path. All errors are returned typed — the auto trigger stays
// best-effort (never throws), the manual endpoint maps them to HTTP.

interface FeatureRow {
  id: string
  title: string
  problem: string
  appetite: string | null
  solution: string | null
  rabbit_holes: string | null
  out_of_bounds: string | null
}

export type OpenIssueError = 'not-found' | 'no-github-repo' | 'no-token' | 'missing-issues-permission' | 'github-error'
export type OpenIssueResult =
  | { ok: true; issue_number: number; issue_url: string; existing: boolean }
  | { ok: false; error: OpenIssueError }

/** Everything Cairn knows about the feature at bet time, beyond the raw pitch — folded into the issue
 *  so the builder gets the full picture (why we bet, the evidence, the cycle) not just a title. */
interface IssueContext {
  hillName: string | null
  rationale: string | null       // the "why" from the bet decision
  decidedBy: string | null
  signals: { content: string; source: string | null }[]  // the feedback that motivated it
  signalCount: number
}

/** Absolute base URL of this instance, for the "back to Cairn" link. Empty when not configured. */
function baseUrl(): string {
  return (process.env.CAIRN_BASE_URL || process.env.NUXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
}

/** Shape Up appetite → a framing the builder reads as a time box, not a bare word. */
function appetiteLabel(a: string | null): string | null {
  if (a === 'small') return 'Small batch — petit lot (~2 semaines)'
  if (a === 'big') return 'Big batch — cycle complet (~6 semaines)'
  return a
}

/** Render the shaped pitch + bet context as a proper execution ticket. Headings mirror the French UI
 *  copy (this is product output, not code); the pitch content is whatever the shaper wrote. Empty
 *  sections are dropped so a thin pitch stays clean rather than showing hollow headings. */
export function renderIssueBody(f: FeatureRow, ctx: IssueContext): string {
  const base = baseUrl()
  const section = (label: string, value: string | null) => (value?.trim() ? `## ${label}\n\n${value.trim()}` : '')
  const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

  // A meta lead so the ticket opens with the cycle / appetite / evidence at a glance.
  const meta: string[] = []
  if (ctx.hillName) meta.push(`**Cycle** · ${ctx.hillName}`)
  const appetite = appetiteLabel(f.appetite)
  if (appetite) meta.push(`**Appétit** · ${appetite}`)
  if (ctx.signalCount) meta.push(`**Signaux** · ${ctx.signalCount}`)

  const evidence = ctx.signals.length
    ? `## Signaux (${ctx.signalCount})\n\n${ctx.signals.map(s => `- ${oneLine(s.content)}${s.source ? ` _(${s.source})_` : ''}`).join('\n')}`
    : ''
  const why = ctx.rationale
    ? `## Pourquoi ce pari\n\n${ctx.rationale.trim()}${ctx.decidedBy ? `\n\n— ${ctx.decidedBy}` : ''}`
    : ''

  return [
    meta.length ? `> ${meta.join('  ·  ')}` : '',
    section('Problème', f.problem),
    section('Solution envisagée', f.solution),
    section('Rabbit holes', f.rabbit_holes),
    section('Hors périmètre (no-gos)', f.out_of_bounds),
    why,
    evidence,
    base ? `---\n🪨 Suivi dans Cairn : ${base}/features/${f.id}` : '',
  ].filter(Boolean).join('\n\n')
}

/** Gather the bet-time context that enriches the issue body. All best-effort reads — a missing bit
 *  just drops its section. */
function gatherContext(featureId: string): IssueContext {
  const feature = get<{ hill_id: string | null; signal_count: number }>('SELECT hill_id, signal_count FROM features WHERE id = ?', featureId)
  const decision = get<{ rationale: string; decided_by: string | null; hill_id: string | null }>(
    "SELECT rationale, decided_by, hill_id FROM decisions WHERE feature_id = ? AND verdict = 'bet' ORDER BY decided_at DESC LIMIT 1",
    featureId,
  )
  const hillId = feature?.hill_id || decision?.hill_id || null
  const hill = hillId ? get<{ name: string }>('SELECT name FROM hills WHERE id = ?', hillId) : null
  const signals = all<{ content: string; source: string | null }>(
    'SELECT content, source FROM feedback WHERE feature_id = ? ORDER BY created_at DESC LIMIT 5',
    featureId,
  )
  return {
    hillName: hill?.name ?? null,
    rationale: decision?.rationale ?? null,
    decidedBy: decision?.decided_by ?? null,
    signals,
    signalCount: feature?.signal_count ?? signals.length,
  }
}

/** Open (or return the already-open) GitHub issue for a bet feature. Idempotent: at most one open
 *  issue per feature. Never throws — returns a typed error the caller surfaces. */
export async function openIssueForFeature(featureId: string, actor: string | null): Promise<OpenIssueResult> {
  const feature = get<FeatureRow>(
    'SELECT id, title, problem, appetite, solution, rabbit_holes, out_of_bounds FROM features WHERE id = ?',
    featureId,
  )
  if (!feature) return { ok: false, error: 'not-found' }

  // Idempotence: reuse an existing open issue rather than opening a duplicate.
  const existing = get<{ issue_number: number; issue_url: string }>(
    "SELECT issue_number, issue_url FROM issue_links WHERE feature_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1",
    featureId,
  )
  if (existing) return { ok: true, issue_number: existing.issue_number, issue_url: existing.issue_url, existing: true }

  const spec = parseSpec(getSetting('code_repo') || process.env.CAIRN_CODE_REPO || '')
  if (spec.mode !== 'github' || !spec.owner || !spec.repo) return { ok: false, error: 'no-github-repo' }

  // PAT first (mirrors codeRepo.ts), then the App installation token. Passed inline — never persisted.
  const token = getSecret('code_repo_token') || await githubInstallationToken()
  if (!token) return { ok: false, error: 'no-token' }

  const repo = `${spec.owner}/${spec.repo}`
  const labels = ['cairn', ...(feature.appetite ? [`appetite:${feature.appetite}`] : [])]
  let res: Awaited<ReturnType<typeof fetch>>
  try {
    res = await fetch(`https://api.github.com/repos/${spec.owner}/${spec.repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: feature.title, body: renderIssueBody(feature, gatherContext(featureId)), labels }),
    })
  }
  catch { return { ok: false, error: 'github-error' } }

  // 403 = the App/PAT lacks Issues:write (read-only install not yet re-consented).
  if (res.status === 403) return { ok: false, error: 'missing-issues-permission' }
  if (!res.ok) return { ok: false, error: 'github-error' }

  const json = await res.json().catch(() => null) as { number?: number; html_url?: string } | null
  if (!json?.number || !json.html_url) return { ok: false, error: 'github-error' }

  run(
    "INSERT INTO issue_links (id, feature_id, repo, issue_number, issue_url, status) VALUES (?, ?, ?, ?, ?, 'open')",
    newId(), featureId, repo, json.number, json.html_url,
  )
  logEvent(featureId, actor, 'issue_opened', `Issue GitHub ouverte · ${repo}#${json.number}`, { repo, issue_number: json.number, issue_url: json.html_url }, actor ? 'user' : 'system')
  return { ok: true, issue_number: json.number, issue_url: json.html_url, existing: false }
}

/** Post-commit hook for the bet write paths: when the workspace opted in (`github_issue_on_bet`), open
 *  an issue for each newly bet feature. Best-effort — swallows every error so it never fails the bet.
 *  MUST be called AFTER the surrounding tx() commits (it does network I/O). */
export async function autoOpenIssuesOnBet(featureIds: string[], actor: string | null): Promise<void> {
  if (getSetting('github_issue_on_bet') !== '1' || !featureIds.length) return
  await Promise.all(featureIds.map(id => openIssueForFeature(id, actor).catch(() => {})))
}
