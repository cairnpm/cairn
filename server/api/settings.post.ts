import { setSecret, setSetting } from '~~/server/db/settings'
import { resetLlm } from '~~/server/llm/provider'

// Update runtime settings. The API key is write-only (sent here, never read back). Changing
// either field drops the cached LLM provider so the next request rebuilds from the new config.
export default defineAuthedHandler(async (event, { actor }) => {
  // Attribution comes from the authenticated session, never the request body.
  const by = actor
  const body = await readBody(event)

  if (typeof body?.anthropic_api_key === 'string') {
    const key = body.anthropic_api_key.trim()
    // Empty string clears the override (falls back to env); a real key is stored.
    setSecret('anthropic_api_key', key || null, by)
  }
  if (typeof body?.anthropic_model === 'string' && body.anthropic_model.trim()) {
    setSetting('anthropic_model', body.anthropic_model.trim(), by)
  }
  if (typeof body?.workspace_name === 'string' && body.workspace_name.trim()) {
    setSetting('workspace_name', body.workspace_name.trim(), by)
  }
  if (typeof body?.workspace_logo_id === 'string') {
    setSetting('workspace_logo', body.workspace_logo_id.trim() || null, by)
  }
  if (typeof body?.code_repo === 'string') {
    // Local path or clone of the product repo the intake greps. Empty clears it (falls back to env).
    setSetting('code_repo', body.code_repo.trim() || null, by)
  }
  if (typeof body?.product_context === 'string') {
    // Workspace product framing injected into every shaping/answer prompt. Empty → generic default.
    setSetting('product_context', body.product_context.trim() || null, by)
  }
  // GitHub App config (so the "Connect GitHub" flow works without a pasted PAT). The private key is
  // write-only — sent here, never read back, like the Anthropic key.
  if (typeof body?.github_app_id === 'string') setSetting('github_app_id', body.github_app_id.trim() || null, by)
  if (typeof body?.github_app_slug === 'string') setSetting('github_app_slug', body.github_app_slug.trim() || null, by)
  if (typeof body?.github_app_private_key === 'string' && body.github_app_private_key.trim()) {
    setSecret('github_app_private_key', body.github_app_private_key.trim(), by)
  }

  resetLlm()
  return { ok: true }
})
