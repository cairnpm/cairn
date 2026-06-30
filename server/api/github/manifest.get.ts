import { setSetting } from '~~/server/db/settings'
import { newId } from '~~/server/utils/id'

// Owner: self-host bootstrap. Serves an auto-submitting form that POSTs a GitHub App *manifest* to
// GitHub — so the admin creates a pre-configured App (callback = THIS instance's own domain) in one
// click, with no App id / private key to paste. GitHub then redirects to /api/github/manifest-callback
// with a code we exchange for the credentials. Pass ?org=<org> to create it under an organisation.
export default defineOwnerHandler((event) => {
  const env = process.env.CAIRN_BASE_URL || process.env.NUXT_PUBLIC_BASE_URL
  const base = (env || getRequestURL(event).origin).replace(/\/$/, '')
  const org = String(getQuery(event).org || '').trim()

  const state = newId()
  setSetting('github_manifest_state', state, 'github-app')

  const host = new URL(base).host.replace(/[^a-z0-9]+/gi, '-')
  const manifest = {
    name: `Cairn ${host}`.slice(0, 34),
    url: base,
    redirect_url: `${base}/api/github/manifest-callback`,
    callback_urls: [`${base}/api/github/callback`],
    setup_url: `${base}/api/github/callback`,
    public: false,
    default_permissions: { contents: 'read', metadata: 'read' },
    default_events: [],
  }
  const action = org
    ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new?state=${state}`
    : `https://github.com/settings/apps/new?state=${state}`

  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  return `<!doctype html><html><body>
<form id="f" method="post" action="${action}">
<input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, '&#39;')}'>
</form>
<script>document.getElementById('f').submit()</script>
</body></html>`
})
