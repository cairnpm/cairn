import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

// The product repo is the ground truth of "what's already built". The intake consults it when shaping
// a pitch — to dedupe against reality, ground the solution, and flag already-shipped work. git grep is
// fast, dependency-free, and never sends code anywhere (self-host friendly). Point CAIRN_CODE_REPO at
// your codebase (defaults to the Cairn repo itself, useful for trying it out).
export interface CodeHit { file: string; line: number; text: string; terms: number }

// Generic English/code noise — never discriminating. Repo-specific ubiquity (e.g. "backlog" in Cairn)
// is handled separately by the document-frequency cap below, so this list stays generic & portable.
const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'when', 'what', 'your', 'you', 'are', 'can',
  'not', 'but', 'add', 'new', 'get', 'set', 'has', 'was', 'will', 'into', 'out', 'all', 'any', 'use',
  'code', 'file', 'files', 'data', 'type', 'types', 'value', 'const', 'function', 'return', 'import',
  'export', 'async', 'await', 'true', 'false', 'null', 'page', 'name', 'list', 'item', 'items',
])

function repoPath(repo?: string) {
  return repo || process.env.CAIRN_CODE_REPO || process.cwd()
}

async function git(args: string[], cwd: string): Promise<string> {
  try { return (await exec('git', args, { cwd, maxBuffer: 8 * 1024 * 1024, timeout: 8000 })).stdout }
  catch { return '' } // git grep exits 1 on no match
}

/** Search the configured repo for code related to `query`. Drops generic + repo-ubiquitous terms,
 *  then ranks files by IDF-weighted overlap of the *discriminating* terms — so a real concept ("CSV
 *  export", "geocode") surfaces precisely, and a query with no specific footprint returns nothing
 *  (a true "not built yet", not a noisy false positive). */
export async function searchCode(query: string, opts: { repo?: string; maxFiles?: number } = {}): Promise<CodeHit[]> {
  const repo = repoPath(opts.repo)
  const tokens = [...new Set((query.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) || []))].filter(t => !STOP.has(t)).slice(0, 10)
  if (!tokens.length) return []

  // Document frequency per term across the whole repo → identify discriminating terms.
  const total = Math.max(1, (await git(['ls-files'], repo)).split('\n').filter(Boolean).length)
  const cap = Math.max(8, Math.ceil(total * 0.06)) // a real concept touches few files, not 6%+ of the repo
  const dfs = await Promise.all(tokens.map(async (t) => {
    const n = (await git(['grep', '-l', '-i', '-I', '--no-color', '-e', t], repo)).split('\n').filter(Boolean).length
    return { t, df: n }
  }))
  const keep = dfs.filter(d => d.df >= 1 && d.df <= cap)
  if (!keep.length) return [] // every term is generic or repo-ubiquitous → no specific footprint

  const idf = new Map(keep.map(d => [d.t, Math.log((total + 1) / (d.df + 0.5))]))
  const terms = keep.map(d => d.t)

  // One grep over the discriminating terms only → group by file, score by IDF overlap.
  const stdout = await git(['grep', '-n', '-i', '-I', '--no-color', '-E', '--', terms.join('|')], repo)
  const byFile = new Map<string, { sample: CodeHit; hit: Set<string>; score: number }>()
  for (const line of stdout.split('\n')) {
    const m = line.match(/^(.+?):(\d+):(.*)$/)
    if (!m) continue
    const [, file, ln, text] = m
    const matched = terms.filter(t => text.toLowerCase().includes(t))
    if (!matched.length) continue
    const cur = byFile.get(file)
    const hit = cur?.hit ?? new Set<string>()
    matched.forEach(t => hit.add(t))
    const score = [...hit].reduce((s, t) => s + (idf.get(t) || 0), 0)
    if (!cur) byFile.set(file, { sample: { file, line: Number(ln), text: text.trim().slice(0, 160), terms: matched.length }, hit, score })
    else { cur.score = score; if (matched.length > cur.sample.terms) cur.sample = { file, line: Number(ln), text: text.trim().slice(0, 160), terms: matched.length } }
  }

  return [...byFile.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.maxFiles ?? 8)
    .map(v => ({ ...v.sample, terms: v.hit.size }))
}

/** Format related code as a context block for the intake prompt (empty string when nothing found). */
export async function codeContextFor(query: string, opts?: { repo?: string }): Promise<string> {
  const hits = await searchCode(query, opts)
  if (!hits.length) return ''
  const lines = hits.map(h => `- ${h.file}:${h.line} — ${h.text}`).join('\n')
  return `Code existant potentiellement lié (vérité terrain du repo) :\n${lines}\n`
    + `→ Si le sujet semble déjà construit, propose un complément/amélioration plutôt qu'un doublon, et ancre la solution sur l'existant.`
}
