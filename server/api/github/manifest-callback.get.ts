import { getSetting, setSetting } from '~~/server/db/settings'

// Public (GitHub redirects here after the admin creates the App from the manifest). Verify the
// one-time state, exchange the temporary code for the App credentials, and store them — so the
// instance owns its own App (callback = its domain) with nothing pasted by hand. Bounce to Settings.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const code = String(q.code || '')
  const state = String(q.state || '')
  const expected = getSetting('github_manifest_state')
  if (!code || !state || state !== expected) {
    return sendRedirect(event, '/settings?github=manifest-error', 302)
  }
  setSetting('github_manifest_state', null, 'github-app')

  try {
    const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
      method: 'POST',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    })
    if (!res.ok) return sendRedirect(event, '/settings?github=manifest-error', 302)
    const app = await res.json() as { id: number; slug: string; pem: string }
    setSetting('github_app_id', String(app.id), 'github-app')
    setSetting('github_app_slug', app.slug, 'github-app')
    setSetting('github_app_private_key', app.pem, 'github-app')
    // App created — next the admin installs it on a repo (Grant access).
    return sendRedirect(event, '/settings?github=app-created', 302)
  }
  catch {
    return sendRedirect(event, '/settings?github=manifest-error', 302)
  }
})
