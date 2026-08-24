import type { PostHog } from 'posthog-js'

/**
 * Holds the SDK once the client plugin has loaded it, and stays null whenever tracking is off. A
 * plugin `provide` would have to be typed around its own early return; this does not.
 */
let client: PostHog | null = null

export function setPostHogClient(instance: PostHog) {
  client = instance
}

export function getPostHogClient() {
  return client
}
