import { get } from '~~/server/db/client'
import { listAssignees } from '~~/server/db/assignees'
import { listFeatureEvents } from '~~/server/db/events'
import { openIssueForFeature, type OpenIssueError } from '~~/server/utils/githubIssues'

// Open a GitHub issue for a bet feature (the pitch → an execution ticket). Owner OR a member assigned
// to the feature may trigger this outward write. Attribution comes from the session, never the body.
const HTTP: Record<OpenIssueError, { statusCode: number; statusMessage: string }> = {
  'not-found': { statusCode: 404, statusMessage: 'Feature introuvable' },
  'no-github-repo': { statusCode: 422, statusMessage: 'Aucun repo GitHub lié — connectez-en un dans les réglages' },
  'no-token': { statusCode: 422, statusMessage: 'App GitHub non configurée' },
  'missing-issues-permission': { statusCode: 403, statusMessage: "Permission Issues manquante — ré-approuvez l'App GitHub (accès en écriture aux issues)" },
  'github-error': { statusCode: 502, statusMessage: "GitHub a refusé la création de l'issue" },
}

export default defineAuthedHandler(async (event, { user, actor }) => {
  const id = getRouterParam(event, 'id')!

  const feature = get<{ status: string }>('SELECT status FROM features WHERE id = ?', id)
  if (!feature) throw createError({ statusCode: 404, statusMessage: 'Feature introuvable' })
  // An issue materialises a bet — premature before it, meaningless after it ships.
  if (feature.status !== 'bet' && feature.status !== 'building') {
    throw createError({ statusCode: 409, statusMessage: 'Une issue ne peut être ouverte que pour une feature pariée' })
  }

  const allowed = user.role === 'owner' || listAssignees(id).some(a => a.user_id === user.id)
  if (!allowed) throw createError({ statusCode: 403, statusMessage: 'Réservé à l\'owner ou à un membre assigné à cette feature' })

  const result = await openIssueForFeature(id, actor)
  if (!result.ok) throw createError(HTTP[result.error])
  if (result.existing) throw createError({ statusCode: 409, statusMessage: 'Une issue est déjà ouverte pour cette feature' })

  // Return the fresh row + timeline so the UI updates in place (mirrors the assignees endpoint).
  const issue = get('SELECT id, repo, issue_number, issue_url, status FROM issue_links WHERE feature_id = ? AND issue_number = ?', id, result.issue_number)
  return { ok: true, issue, events: listFeatureEvents(id) }
})
