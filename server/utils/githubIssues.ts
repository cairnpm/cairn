import { get, run } from '../db/client'
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

/** Absolute base URL of this instance, for the "back to Cairn" link. Empty when not configured. */
function baseUrl(): string {
  return (process.env.CAIRN_BASE_URL || process.env.NUXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
}

/** Render the pitch as an issue body. Headings mirror the French UI copy (this is product output,
 *  not code); the pitch content is whatever the shaper wrote. */
export function renderIssueBody(f: FeatureRow): string {
  const base = baseUrl()
  const section = (label: string, value: string | null) => (value?.trim() ? `## ${label}\n\n${value.trim()}\n` : '')
  return [
    section('Problème', f.problem),
    f.appetite ? `## Appétit\n\n${f.appetite}\n` : '',
    section('Solution', f.solution),
    section('Rabbit holes', f.rabbit_holes),
    section('Hors périmètre', f.out_of_bounds),
    base ? `\n---\n🪨 Suivi dans Cairn : ${base}/features/${f.id}` : '',
  ].filter(Boolean).join('\n')
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
      body: JSON.stringify({ title: feature.title, body: renderIssueBody(feature), labels }),
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
