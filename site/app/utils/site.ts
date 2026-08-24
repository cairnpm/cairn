const REPO = 'https://github.com/cairnpm/cairn'

// Single source of truth for the outbound links the landing points at.
export const LINKS = {
  repo: REPO,
  selfHost: `${REPO}/blob/main/DEPLOY.md`,
  intake: `${REPO}/blob/main/docs/intake.md`,
  roadmap: `${REPO}/blob/main/ROADMAP.md`,
  contributing: `${REPO}/blob/main/CONTRIBUTING.md`,
  license: `${REPO}/blob/main/LICENSE`,
} as const

export type LinkName = keyof typeof LINKS

/**
 * The analytics name of an outbound link, derived from the URL rather than passed alongside it — one
 * more prop per call site is one more place for the label and the href to disagree.
 */
export function linkName(href: string): LinkName | 'unknown' {
  const hit = Object.entries(LINKS).find(([, url]) => url === href)
  return hit ? (hit[0] as LinkName) : 'unknown'
}
