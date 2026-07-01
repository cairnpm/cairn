import { setSetting } from '~~/server/db/settings'
import { syncRepo } from '~~/server/utils/codeRepo'
import { installationTokenFor, listAppInstallations, listInstallationRepos } from '~~/server/utils/githubApp'

// Owner-only: discover the App's installation server-side (covers installs done straight from GitHub,
// not via our callback), store it, auto-detect the granted repo, and clone — then report status.
export default defineOwnerHandler(async () => {
  const installs = await listAppInstallations()
  if (!installs.length) return { ok: false as const, error: 'no-installation' as const }

  // Pick the first installation that actually grants repos.
  for (const inst of installs) {
    const token = await installationTokenFor(inst.id)
    if (!token) continue
    const repo = (await listInstallationRepos(token))[0]
    if (!repo) continue
    setSetting('github_installation_id', String(inst.id), 'github-app')
    setSetting('code_repo', repo, 'github-app')
    const status = await syncRepo(repo, token)
    return { ...status, account: inst.account, repo, installations: installs.map(i => i.account) }
  }
  return { ok: false as const, error: 'no-repos' as const, installations: installs.map(i => i.account) }
})
