import { readFileSync } from 'node:fs'
import { importRoadmap, type Roadmap } from '~~/server/db/importRoadmap'

// Owner-only one-shot migration: POST the reviewed roadmap JSON ({ hills?, features? }) to seed the
// historical context (finished hills + delivered features + their signals). Idempotent / re-runnable.
// Runs in-context (DB + aliases resolved); the same importRoadmap() is reusable from a future MCP tool.
// Dev convenience: with no body, loads the project-root roadmap.json.
export default defineOwnerHandler(async (event, { actor }) => {
  let body = await readBody<Roadmap>(event).catch(() => null)
  if (import.meta.dev && (!body || (!body.hills && !body.features))) {
    try { body = JSON.parse(readFileSync('roadmap.json', 'utf8')) } catch { /* no file — fall through */ }
  }
  if (!body || (!Array.isArray(body.hills) && !Array.isArray(body.features))) {
    throw createError({ statusCode: 400, statusMessage: 'Expected JSON { hills?: [...], features?: [...] } (or roadmap.json in dev)' })
  }
  return importRoadmap(body, { actor })
})
