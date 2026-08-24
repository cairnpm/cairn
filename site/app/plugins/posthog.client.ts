import posthog from 'posthog-js'
import { setPostHogClient } from '../utils/posthog'

/**
 * Marketing analytics — the PUBLIC SITE ONLY.
 *
 * This plugin lives in site/, never in the product: Cairn is zero-egress by design, and the landing it
 * ships with says so in as many words. Instrumenting the self-hosted app would make that a lie.
 *
 * The settings that are decisions, not defaults:
 *
 *  - `autocapture: false`. Two deliberate events (site/docs/tracking.md); autocapture would bury them
 *    under thousands of $autocapture rows that answer nothing.
 *  - `person_profiles: 'identified_only'`. Nobody ever identifies on a landing page, so no profiles are
 *    created at all: the events stay anonymous and cost nothing.
 *  - cookieless. `memory` keeps super-properties in the tab and `disable_persistence` stops any write
 *    to cookies or localStorage, so there is no consent banner to put in front of a page whose whole
 *    argument is that nobody is watching you. The cost is real and worth naming: every visit is a new
 *    visitor, so returning-visitor and multi-session attribution are gone.
 *  - `capture_pageview: 'history_change'` via `defaults`. This is where the site departs from the
 *    manual `router.afterEach` hook used in the other repos, on purpose: this page is PRERENDERED and
 *    is the only route, so the one pageview that matters is the initial load — and a plugin runs after
 *    Nuxt has already resolved it. `'history_change'` is documented to capture "the initial page load
 *    and on history API changes" (PostHogConfig.capture_pageview), which is the same intent with no
 *    reliance on hook ordering, and still covers a future /pricing.
 *
 * Dropping the client IP is not set here — posthog-js `ip` is deprecated and inert. It's the project's
 * "Discard client IP data" setting, already on, which still resolves geo before discarding.
 *
 * Note when verifying: posthog-js silently drops events from automated browsers (it checks
 * `navigator.webdriver`), so headless Chrome and any CDP-driven session send nothing at all. Open the
 * site in a normal browser, or the events will never arrive.
 */
export default defineNuxtPlugin(() => {
  const { key, host, uiHost } = useRuntimeConfig().public.posthog
  if (!key) return

  posthog.init(key, {
    api_host: host,
    // api_host is a same-origin proxy, so the toolbar and replay links need the real app URL.
    ui_host: uiHost,

    autocapture: false,
    person_profiles: 'identified_only',

    persistence: 'memory',
    disable_persistence: true,

    // Replay and heatmaps are off in the project, and both want durable storage we deliberately refuse.
    disable_session_recording: true,

    defaults: '2025-05-24',
  })

  setPostHogClient(posthog)
})
