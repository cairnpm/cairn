import { ensureSchema } from '../db/schema'
import { seedIfEmpty } from '../db/seed'
import { seedUsersIfEmpty } from '../db/users'
import { markStaleFeatures } from '../db/stale'

// Create tables + seed demo data once at server startup.
export default defineNitroPlugin(() => {
  try {
    ensureSchema()
    seedIfEmpty()
    seedUsersIfEmpty()
    markStaleFeatures()
  } catch (err) {
    console.error('[db] init failed', err)
  }
})
