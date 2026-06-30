import { getSecret, setSecret, setSetting } from '~~/server/db/settings'
import { syncRepo } from '~~/server/utils/codeRepo'
import { githubInstallationToken } from '~~/server/utils/githubApp'

// Owner-only: link the product repo for the WHOLE workspace (stored in settings, used by the intake
// for every member). Saves the repo spec (local path OR github owner/repo) + an optional read token
// (write-only, never read back — like the Anthropic key), then clones/refreshes and reports status.
// For GitHub, auth resolves to: explicit PAT → GitHub App installation token → ambient git creds (dev).
export default defineOwnerHandler(async (event, { actor }) => {
  const body = await readBody<{ repo?: string; token?: string }>(event).catch(() => null)
  const repo = (body?.repo || '').trim()

  // Persist the link (empty repo clears it). A provided token is stored; omit to keep the current one.
  setSetting('code_repo', repo || null, actor)
  if (typeof body?.token === 'string') setSecret('code_repo_token', body.token.trim() || null, actor)
  if (!repo) return { ok: false as const, error: 'empty' as const }

  const token = getSecret('code_repo_token') || await githubInstallationToken()
  return syncRepo(repo, token)
})
