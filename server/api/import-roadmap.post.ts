import { importRoadmap, type Roadmap } from '~~/server/db/importRoadmap'

// Owner-only one-shot migration: POST the reviewed roadmap JSON ({ hills?, features? }) to seed the
// historical context (finished hills + delivered features + their signals). Idempotent / re-runnable.
// Runs in-context (DB + aliases resolved); the same importRoadmap() is reusable from a future MCP tool.
export default defineOwnerHandler(async (event, { actor }) => {
  const body = await readBody<Roadmap>(event)
  if (!body || (!Array.isArray(body.hills) && !Array.isArray(body.features))) {
    throw createError({ statusCode: 400, statusMessage: 'Expected JSON { hills?: [...], features?: [...] }' })
  }
  return importRoadmap(body, { actor })
})
