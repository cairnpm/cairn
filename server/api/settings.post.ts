import { setSetting } from '~~/server/db/settings'
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
    setSetting('anthropic_api_key', key || null, by)
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

  resetLlm()
  return { ok: true }
})
