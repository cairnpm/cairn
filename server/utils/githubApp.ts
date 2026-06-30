import { createSign } from 'node:crypto'
import { getSetting } from '../db/settings'

// GitHub App auth: instead of a pasted PAT, the workspace installs the Cairn App on its repo and we
// mint short-lived (1h) installation tokens on demand — read-only, per-repo, revocable from GitHub.
// Config (App id + private key) lives in settings (private key write-only), env as fallback.
export function githubAppConfig() {
  return {
    appId: getSetting('github_app_id') || process.env.GITHUB_APP_ID || '',
    privateKey: getSetting('github_app_private_key') || process.env.GITHUB_APP_PRIVATE_KEY || '',
    slug: getSetting('github_app_slug') || process.env.GITHUB_APP_SLUG || 'cairn-pm',
    installationId: getSetting('github_installation_id') || process.env.GITHUB_INSTALLATION_ID || '',
  }
}

export function githubAppReady() {
  const { appId, privateKey } = githubAppConfig()
  return !!(appId && privateKey)
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')

// App JWT (RS256, iss=appId, ≤10min). iat backdated 60s for clock skew. Signed with node:crypto — no dep.
function mintJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey, 'base64url')
  return `${head}.${body}.${sig}`
}

let cache: { token: string; exp: number } | null = null

/** Mint (or reuse) an installation access token to clone/pull the linked repo. Null when the App
 *  isn't configured or installed, or GitHub rejects (caller falls back to a PAT / ambient creds). */
export async function githubInstallationToken(): Promise<string | null> {
  const { appId, privateKey, installationId } = githubAppConfig()
  if (!appId || !privateKey || !installationId) return null
  if (cache && cache.exp > Date.now() + 60_000) return cache.token
  try {
    const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mintJwt(appId, privateKey)}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    })
    if (!res.ok) return null
    const json = await res.json() as { token: string; expires_at: string }
    cache = { token: json.token, exp: new Date(json.expires_at).getTime() }
    return json.token
  }
  catch { return null }
}
