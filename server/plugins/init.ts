import { ensureSchema } from '../db/schema'
import { seedIfEmpty } from '../db/seed'
import { migrateSecretsAtRest } from '../db/settings'
import { seedUsersIfEmpty, reconcileAttribution } from '../db/users'
import { markStaleFeatures } from '../db/stale'
import { purgeIntakeSessions } from '../db/purgeIntake'

// Create tables + seed demo data once at server startup.
export default defineNitroPlugin(() => {
  try {
    ensureSchema()
    migrateSecretsAtRest()
    seedIfEmpty()
    seedUsersIfEmpty()
    reconcileAttribution()
    markStaleFeatures()
    purgeIntakeSessions()
  } catch (err) {
    console.error('[db] init failed', err)
  }
})
