# Tracking plan — the public site

Scope: **`site/` only.** The Cairn product is zero-egress by architecture invariant (CLAUDE.md) and
this very landing page promises "no telemetry, no phone-home". Nothing here is ever added to the app.

One question drives the plan: **does the landing turn a reader into someone who runs Cairn?** Anything
that does not help answer it is left out — no autocapture, no session recording, no heatmaps.

## Events

| Event         | Fired when                                   | Properties                                        |
| ------------- | -------------------------------------------- | ------------------------------------------------- |
| `$pageview`   | The page is opened (or a future route is)     | PostHog's own URL / referrer / UTM properties      |
| `cta_clicked` | Any outbound link is clicked                  | `cta` (see below), `surface` (`nav`\|`hero`\|`footer`) |
| `faq_opened`  | An FAQ accordion item is opened               | `question`                                        |

`cta` is the key from `LINKS` in `app/utils/site.ts` — `repo`, `selfHost`, `intake`, `roadmap`,
`contributing`, `license` — derived from the href rather than passed per call site, so the label and
the destination cannot disagree.

## What each one answers

- **Does anyone arrive, and from where?** `$pageview` by referrer and UTM. With one page, this is the
  traffic number.
- **Does the page convert?** `cta_clicked` where `cta = selfHost` against `$pageview` — the closest
  thing to a signup this site has.
- **Which pitch does the work?** `surface` separates the hero CTA from the nav button and the footer
  list. If `hero` loses to `nav`, the hero copy is not carrying its weight.
- **Do people want to run it or read it?** `selfHost` and `repo` against `intake` and `roadmap`.
- **Where does the copy leave a gap?** `faq_opened` by `question`. A question everyone opens is one the
  page above it failed to answer.

## Deliberately not tracked

Scroll depth, time on page, hovers, mouse movement, and anything that identifies a visitor.
`person_profiles` is `identified_only` and nobody ever identifies here, so no person profiles are
created at all.

**Cookieless, by decision.** `persistence: 'memory'` plus `disable_persistence` means nothing is
written to cookies or localStorage, so the site carries no consent banner — which would be an odd
thing to put in front of a page arguing that nobody is watching you. The cost is real: every visit is
a new visitor, so returning-visitor and multi-session attribution do not exist. Read the visitor count
as a visit count.

The project also has **"Discard client IP data"** on: geo is resolved from the IP, then the IP is
dropped. (PostHog's own `cookieless_mode: 'always'` would go one step further, but it currently strips
the IP *before* GeoIP runs — PostHog/posthog#48660 — which would cost every country breakdown. Worth
revisiting when that closes.)

## Implementation

- `app/plugins/posthog.client.ts` initialises the SDK **only when `NUXT_PUBLIC_POSTHOG_KEY` is set** at
  build time. Cairn is a public repo, so the key is not in it: local dev, previews and forks send
  nothing by default.
- `app/composables/useTracking.ts` is the only place events are named; call sites use its helpers.
- Events go to `/ingest`, proxied same-origin to PostHog EU by `site/nginx.conf.template`. Cairn's
  audience is developers — the most ad-blocked audience there is — and a direct `posthog.com` request
  is simply dropped for a large slice of them.

**Verifying it works:** posthog-js silently drops events from automated browsers (it checks
`navigator.webdriver`), so headless Chrome and any CDP-driven session send nothing at all — the SDK
loads, initialises, and never makes a request. Open the site in a normal browser instead.
