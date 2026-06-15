import { ensureSchema } from '../db/schema'
import { seedIfEmpty } from '../db/seed'

// Create tables + seed demo data once at server startup.
export default defineNitroPlugin(() => {
  try {
    ensureSchema()
    seedIfEmpty()
  } catch (err) {
    console.error('[db] init failed', err)
  }
})
