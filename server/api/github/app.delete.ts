import { setSecret, setSetting } from '~~/server/db/settings'

// Reset the GitHub App config (owner-only). Start over if the App was created under the wrong
// account/org — clearing the credentials sends the card back to "Créer la GitHub App" so the admin can
// recreate it pointing at the right org. Clears the App identity, private key, the installation, and any
// in-flight flow state. The GitHub App itself still exists on GitHub (delete it there if you want); Cairn
// just forgets it. `code_repo` is left as-is (may be a local path / env) and is re-detected on reconnect.
export default defineOwnerHandler((event, { actor }) => {
  const by = actor
  for (const key of ['github_app_id', 'github_app_slug', 'github_installation_id', 'github_install_state', 'github_manifest_state'] as const) {
    setSetting(key, null, by)
  }
  setSecret('github_app_private_key', null, by)
  return { ok: true }
})
