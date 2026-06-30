import { getSetting, setSetting } from '~~/server/db/settings'

// Public route (GitHub redirects here after the user grants access — no Cairn session involved).
// Verify the one-time state, store the installation id for the workspace, then bounce to Settings.
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const state = String(q.state || '')
  const installationId = String(q.installation_id || '')
  const expected = getSetting('github_install_state')
  if (installationId && state && expected && state === expected) {
    setSetting('github_installation_id', installationId, 'github-app')
    setSetting('github_install_state', null, 'github-app')
    return sendRedirect(event, '/settings?github=connected', 302)
  }
  return sendRedirect(event, '/settings?github=error', 302)
})
