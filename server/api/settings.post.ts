import { ensureSchema } from '~~/server/db/schema'
import { setSetting } from '~~/server/db/settings'
import { resetLlm } from '~~/server/llm/provider'

// Update runtime settings. The API key is write-only (sent here, never read back). Changing
// either field drops the cached LLM provider so the next request rebuilds from the new config.
export default defineEventHandler(async (event) => {
  ensureSchema()
  const body = await readBody(event)
  const by = typeof body?.updated_by === 'string' ? body.updated_by : null

  if (typeof body?.anthropic_api_key === 'string') {
    const key = body.anthropic_api_key.trim()
    // Empty string clears the override (falls back to env); a real key is stored.
    setSetting('anthropic_api_key', key || null, by)
  }
  if (typeof body?.anthropic_model === 'string' && body.anthropic_model.trim()) {
    setSetting('anthropic_model', body.anthropic_model.trim(), by)
  }

  resetLlm()
  return { ok: true }
})
