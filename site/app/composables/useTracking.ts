import { getPostHogClient } from '../utils/posthog'
import { linkName } from '../utils/site'

/** Where on the page a CTA sits. The same destination converts very differently per surface. */
export type Surface = 'nav' | 'hero' | 'footer'

/**
 * The only place events are named. Call sites use these helpers so the tracking plan
 * (site/docs/tracking.md) and the code cannot drift apart.
 */
export function useTracking() {
  function capture(event: string, properties: Record<string, string> = {}) {
    // No key, no SDK: every call site stays a no-op rather than guarding itself.
    getPostHogClient()?.capture(event, properties)
  }

  return {
    /** Every outbound link on the site. `cta` is derived from the href — see utils/site.ts. */
    ctaClicked: (href: string, surface: Surface) =>
      capture('cta_clicked', { cta: linkName(href), surface }),

    faqOpened: (question: string) => capture('faq_opened', { question }),
  }
}
