import { getSetting } from '~~/server/db/settings'

// Read-only settings view. NEVER returns the API key in clear — only whether one is set, and
// where it comes from (DB setting vs env fallback).
export default defineEventHandler(() => {
  const dbKey = getSetting('anthropic_api_key')
  const model = getSetting('anthropic_model') ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
  return {
    workspace_name: getSetting('workspace_name') ?? 'Cairn',
    workspace_logo: getSetting('workspace_logo') ?? null,
    has_key: !!(dbKey || process.env.ANTHROPIC_API_KEY),
    key_source: dbKey ? 'settings' : process.env.ANTHROPIC_API_KEY ? 'env' : 'none',
    model,
    models: ['claude-sonnet-4-6', 'claude-opus-4-8'],
  }
})
