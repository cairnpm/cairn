import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { grepPath } from '~~/server/utils/codeRepo'

// Owner: draft a product-context blurb from the linked repo's top-level docs (the conventional homes
// for product framing). The user edits + saves it — we never auto-apply. Capped so it stays a terse
// preamble, not a repo dump.
// Product-describing docs first (README/DESIGN), agent-behaviour docs last (they're about coding, not
// the product). It's only a draft the user edits anyway.
const DOCS = ['README.md', 'DESIGN.md', 'PRODUCT.md', 'docs/product.md', 'AGENTS.md', 'CLAUDE.md']
const BUDGET = 4000

export default defineOwnerHandler(() => {
  const dir = grepPath()
  if (!dir) return { ok: false as const, error: 'no-repo' as const }

  const parts: string[] = []
  let left = BUDGET
  for (const f of DOCS) {
    if (left <= 0) break
    const p = join(dir, f)
    if (!existsSync(p)) continue
    try {
      const txt = readFileSync(p, 'utf8').trim()
      if (!txt) continue
      const slice = txt.slice(0, left)
      parts.push(`# ${f}\n${slice}`)
      left -= slice.length
    }
    catch { /* unreadable — skip */ }
  }
  if (!parts.length) return { ok: false as const, error: 'no-docs' as const }
  return { ok: true as const, text: parts.join('\n\n') }
})
