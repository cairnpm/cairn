import { existsSync } from 'node:fs'

// Self-host update check: compare the version baked at build time against the latest GitHub release.
// One anonymous GET, no payload, no identifier — the only outbound call Cairn makes on its own
// behalf, and it's togglable (Settings → Workspace, `update_check`). See CLAUDE.md.

const RELEASES_URL = 'https://api.github.com/repos/cairnpm/cairn/releases/latest'
const TTL_MS = 6 * 60 * 60 * 1000 // 6h — releases are rare; don't burn the 60 req/h anonymous quota

/** How this instance was deployed — decides which update command we show. */
export type Host = 'fly' | 'render' | 'docker' | 'source'

export interface Release { version: string; url: string; published_at: string | null }

/**
 * Detect the deployment target from the ambient env. Fly and Render inject their own markers;
 * `/.dockerenv` means a container (Compose is the documented path, so it gets the compose command).
 * `CAIRN_HOST` overrides for anything exotic (Kubernetes, systemd, a PaaS we don't know).
 */
export function detectHost(env: Record<string, string | undefined> = process.env): Host {
  const forced = env.CAIRN_HOST
  if (forced === 'fly' || forced === 'render' || forced === 'docker' || forced === 'source') return forced
  if (env.FLY_APP_NAME) return 'fly'
  if (env.RENDER) return 'render'
  if (existsSync('/.dockerenv')) return 'docker'
  return 'source'
}

const DOCS = 'https://github.com/cairnpm/cairn/blob/main/DEPLOY.md'

/**
 * The copy-pastable command that updates *this* install — the happy path, not the whole story:
 * source installs still have to restart their own service manager, Render can also deploy from its
 * dashboard. `docsUrl` sends the reader to the host's section in DEPLOY.md for the rest.
 * Keep both in sync with DEPLOY.md § Updating.
 */
export function updateCommand(host: Host, env: Record<string, string | undefined> = process.env): string {
  if (host === 'fly') return 'git pull && fly deploy'
  // The service id is right there in Render's own env — fill it in rather than make them look it up.
  if (host === 'render') return `render deploys create ${env.RENDER_SERVICE_ID ?? '<service-id>'} --wait`
  if (host === 'docker') return 'docker compose pull && docker compose up -d'
  return 'git pull && pnpm install --frozen-lockfile && pnpm build'
}

/** Deep link to this host's section of the self-hosting guide (GitHub's heading anchors). */
export function docsUrl(host: Host): string {
  const anchor = host === 'fly' ? 'flyio' : host === 'render' ? 'render' : host === 'docker' ? 'docker-compose' : 'from-source'
  return `${DOCS}#${anchor}`
}

/**
 * Compare two semver-ish versions. Returns >0 when `a` is newer, 0 when equal, <0 when older.
 * Pre-release suffixes (`1.2.0-rc.1`) are ignored beyond ranking below the same release — enough
 * for "is there something newer", which is all this feature claims.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = '', pre = ''] = v.replace(/^v/, '').split('-', 2)
    const nums = core.split('.').map(n => Number.parseInt(n, 10) || 0)
    return { nums, pre }
  }
  const x = parse(a); const y = parse(b)
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  // Same core: a pre-release ranks below the plain release (semver §11).
  if (x.pre === y.pre) return 0
  if (!x.pre) return 1
  if (!y.pre) return -1
  return x.pre > y.pre ? 1 : -1
}

let cache: { at: number; release: Release | null } | null = null

/** Test seam + a way to drop the cache when the toggle flips. */
export function resetUpdateCache(): void { cache = null }

/**
 * Latest published release, cached for 6h. Returns null on any failure (offline instance, rate
 * limit, GitHub down) — an update check must never surface an error to a self-hoster.
 * `force` bypasses the cache for the explicit "check now" button.
 */
export async function latestRelease(force = false, fetchImpl: typeof fetch = fetch): Promise<Release | null> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.release
  let release: Release | null = null
  try {
    const res = await fetchImpl(RELEASES_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        // GitHub rejects API requests without one.
        'User-Agent': 'cairn-update-check',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const json = await res.json() as { tag_name?: string; html_url?: string; published_at?: string; draft?: boolean }
      if (json.tag_name && !json.draft) {
        release = { version: json.tag_name.replace(/^v/, ''), url: json.html_url ?? '', published_at: json.published_at ?? null }
      }
    }
  }
  catch { /* offline / timeout / rate-limited → no release info, never an error */ }
  // Cache misses too: a failing check shouldn't retry on every settings page view.
  cache = { at: Date.now(), release }
  return release
}
