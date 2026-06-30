import { getSetting, setSetting } from '~~/server/db/settings'
import { syncRepo } from '~~/server/utils/codeRepo'
import { githubInstallationToken, listInstallationRepos } from '~~/server/utils/githubApp'

// Public route (GitHub redirects here after the user grants access — no Cairn session involved).
// Verify the one-time state, store the installation, then auto-detect the granted repo and clone it —
// so the user never types owner/repo. Bounce back to Settings.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const state = String(q.state || '')
  const installationId = String(q.installation_id || '')
  const expected = getSetting('github_install_state')
  if (!installationId || !state || state !== expected) {
    return sendRedirect(event, '/settings?github=error', 302)
  }

  setSetting('github_installation_id', installationId, 'github-app')
  setSetting('github_install_state', null, 'github-app')

  // Auto-resolve + clone the granted repo (pick the first if several were selected).
  const token = await githubInstallationToken()
  const repos = token ? await listInstallationRepos(token) : []
  if (repos[0] && token) {
    setSetting('code_repo', repos[0], 'github-app')
    await syncRepo(repos[0], token)
  }
  return sendRedirect(event, '/settings?github=connected', 302)
})
