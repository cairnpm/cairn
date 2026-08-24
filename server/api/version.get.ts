import { getSetting } from '~~/server/db/settings'
import { compareVersions, detectHost, docsUrl, latestRelease, updateCommand } from '~~/server/utils/updateCheck'

// What version this instance runs, and whether a newer release exists upstream. The check is enabled
// by default and disabled with `update_check = 0` (Settings → Workspace). `?force=1` is the "check
// now" button: it bypasses the 6h cache, never the toggle — off means no outbound call at all.
export default defineAuthedHandler(async (event) => {
  const current = useRuntimeConfig(event).cairnVersion
  const host = detectHost()
  const enabled = getSetting('update_check') !== '0'
  const force = getQuery(event).force === '1'

  const release = enabled ? await latestRelease(force) : null
  return {
    current,
    host,
    command: updateCommand(host),
    // The command is the happy path; this is the full per-host procedure (restarts, volumes, caveats).
    docs_url: docsUrl(host),
    check_enabled: enabled,
    latest: release?.version ?? null,
    release_url: release?.url ?? null,
    published_at: release?.published_at ?? null,
    update_available: !!release && compareVersions(release.version, current) > 0,
  }
})
