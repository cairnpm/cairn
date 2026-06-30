import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { getSecret, getSetting } from '../db/settings'
import { githubInstallationToken } from './githubApp'

const exec = promisify(execFile)

// Where Cairn keeps server-side shallow clones of linked GitHub repos. One grep target per workspace
// (the link is a workspace-wide setting). On a hosted deploy this should sit on the persistent volume.
const REPOS_DIR = join(process.env.CAIRN_DATA_DIR || '.data', 'repos')

export interface RepoStatus { ok: boolean; files?: number; mode?: 'local' | 'github'; error?: string }

/** A repo spec is either an absolute local path (self-host, zero egress) or a GitHub ref
 *  (owner/repo or a github URL) that Cairn clones server-side and greps. */
export function parseSpec(spec: string): { mode: 'local' | 'github'; owner?: string; repo?: string; slug?: string } {
  const s = spec.trim()
  if (s.startsWith('/')) return { mode: 'local' }
  const m = s.match(/github\.com[/:]([^/]+)\/([^/.\s]+)/) || s.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/)
  if (m) return { mode: 'github', owner: m[1], repo: m[2], slug: `${m[1]}-${m[2]}`.toLowerCase() }
  return { mode: 'github' } // unparseable github-ish → caller surfaces an error
}

async function git(args: string[], cwd?: string) {
  return (await exec('git', args, { cwd, maxBuffer: 16 * 1024 * 1024, timeout: 120_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout
}

async function fileCount(dir: string) {
  return (await git(['-C', dir, 'ls-files']).catch(() => '')).split('\n').filter(Boolean).length
}

/** The local directory the intake should grep for this workspace — the local path itself, or the
 *  server-side clone of the linked GitHub repo. Undefined when nothing is linked / not yet cloned. */
export function grepPath(): string | undefined {
  const spec = getSetting('code_repo') || process.env.CAIRN_CODE_REPO
  if (!spec) return undefined
  const p = parseSpec(spec)
  if (p.mode === 'local') return existsSync(spec) ? spec : undefined
  const dir = p.slug ? join(REPOS_DIR, p.slug) : undefined
  return dir && existsSync(dir) ? dir : undefined
}

const REFRESH_TTL_MS = 10 * 60_000 // re-fetch a GitHub clone at most every 10 min, lazily on use

function lastFetchedMs(dir: string): number {
  try { return statSync(join(dir, '.git', 'FETCH_HEAD')).mtimeMs }
  catch { try { return statSync(join(dir, '.git')).mtimeMs } catch { return 0 } }
}

/** Keep the grep current without a webhook: if the linked GitHub clone is older than the TTL, do a
 *  shallow fetch+reset before the intake reads it. No-op for local paths (always live) and within the
 *  TTL. Best-effort — on failure the previous clone is kept. Call before grepping. */
export async function refreshIfStale(): Promise<void> {
  const spec = getSetting('code_repo') || process.env.CAIRN_CODE_REPO
  if (!spec) return
  const p = parseSpec(spec.trim())
  if (p.mode !== 'github' || !p.slug) return
  const dir = join(REPOS_DIR, p.slug)
  if (!existsSync(join(dir, '.git')) || Date.now() - lastFetchedMs(dir) < REFRESH_TTL_MS) return
  const token = getSecret('code_repo_token') || await githubInstallationToken()
  await syncRepo(spec, token).catch(() => {}) // fetch --depth 1 + reset; keep old clone on failure
}

/** Validate/refresh the linked repo. Local path → just count files. GitHub → shallow clone (or refresh)
 *  into the server-side cache using the workspace token (write-only), falling back to ambient git
 *  credentials when no token is set (handy in local dev). Never logs the tokenised URL. */
export async function syncRepo(spec: string, token?: string | null): Promise<RepoStatus> {
  const s = spec.trim()
  if (!s) return { ok: false, error: 'empty' }
  const p = parseSpec(s)

  if (p.mode === 'local') {
    if (!existsSync(s)) return { ok: false, mode: 'local', error: 'not-found' }
    const files = await fileCount(s)
    return files ? { ok: true, mode: 'local', files } : { ok: false, mode: 'local', error: 'empty-or-not-git' }
  }

  if (!p.owner || !p.repo) return { ok: false, mode: 'github', error: 'bad-ref' }
  const auth = token ? `${encodeURIComponent('x-access-token')}:${encodeURIComponent(token)}@` : ''
  const url = `https://${auth}github.com/${p.owner}/${p.repo}.git`
  const dir = join(REPOS_DIR, p.slug!)
  try {
    mkdirSync(REPOS_DIR, { recursive: true })
    if (existsSync(join(dir, '.git'))) {
      await git(['-C', dir, 'remote', 'set-url', 'origin', url])
      await git(['-C', dir, 'fetch', '--depth', '1', 'origin', 'HEAD'])
      await git(['-C', dir, 'reset', '--hard', 'FETCH_HEAD'])
    }
    else {
      await git(['clone', '--depth', '1', url, dir])
    }
    const files = await fileCount(dir)
    return files ? { ok: true, mode: 'github', files } : { ok: false, mode: 'github', error: 'empty' }
  }
  catch {
    return { ok: false, mode: 'github', error: 'clone-failed' } // bad token / no access / network
  }
}
