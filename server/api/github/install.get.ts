import { setSetting } from '~~/server/db/settings'
import { githubAppConfig } from '~~/server/utils/githubApp'
import { newId } from '~~/server/utils/id'

// Owner: start the GitHub App install flow — bounce to GitHub's native "grant access to these repos"
// screen. A one-time state guards the callback against a forged installation_id.
export default defineOwnerHandler((event) => {
  const { slug } = githubAppConfig()
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'GitHub App not configured (set its slug + key first)' })
  const state = newId()
  setSetting('github_install_state', state, 'github-app')
  return sendRedirect(event, `https://github.com/apps/${slug}/installations/new?state=${state}`, 302)
})
