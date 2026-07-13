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
