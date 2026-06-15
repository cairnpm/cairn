import { get, run, tx } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'

// GitHub PR webhook → update pr_links → autoclose the linked feature on merge.
// NOTE: signature verification (X-Hub-Signature-256) is a TODO before exposing publicly.
export default defineEventHandler(async (event) => {
  ensureSchema()
  const body = await readBody(event)
  const pr = body?.pull_request
  const repo = body?.repository?.full_name as string | undefined
  if (!pr || !repo) return { ok: true, ignored: 'not a PR event' }

  const number = pr.number as number
  const link = get<{ id: string, feature_id: string, auto_close: number }>(
    'SELECT id, feature_id, auto_close FROM pr_links WHERE repo = ? AND pr_number = ?',
    repo, number,
  )
  if (!link) return { ok: true, ignored: `unlinked PR ${repo}#${number}` }

  const merged = pr.merged === true || body?.action === 'closed' && pr.merged
  const status = merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open'
  const now = new Date().toISOString()

  tx(() => {
    run(
      'UPDATE pr_links SET status = ?, closed_at = ? WHERE id = ?',
      status, status === 'open' ? null : now, link.id,
    )
    if (status === 'merged' && link.auto_close) {
      run('UPDATE features SET status = ?, updated_at = ? WHERE id = ?', 'done', now, link.feature_id)
    }
  })

  return { ok: true, feature_id: link.feature_id, pr_status: status, autoclosed: status === 'merged' && !!link.auto_close }
})
