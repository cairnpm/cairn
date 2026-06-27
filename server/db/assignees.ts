import { all, run } from './client'
import { newId } from '../utils/id'

export type AssigneeRole = 'shaper' | 'builder'

export interface Assignee {
  id: string
  user_id: string
  name: string
  avatar_url: string | null
  role: AssigneeRole
}

// Assignees resolve the member's CURRENT name + avatar via the user_id FK (live reference).
export function listAssignees(featureId: string): Assignee[] {
  return all<Assignee>(
    `SELECT a.id, a.user_id, a.role, u.name, u.avatar_url
     FROM feature_assignees a JOIN users u ON u.id = a.user_id
     WHERE a.feature_id = ?
     ORDER BY a.role, a.assigned_at`,
    featureId,
  )
}

export function addAssignee(featureId: string, userId: string, role: AssigneeRole, assignedBy: string): void {
  run(
    `INSERT OR IGNORE INTO feature_assignees (id, feature_id, user_id, role, assigned_by, assigned_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    newId(), featureId, userId, role, assignedBy,
  )
}

export function removeAssignee(featureId: string, userId: string, role: AssigneeRole): void {
  run('DELETE FROM feature_assignees WHERE feature_id = ? AND user_id = ? AND role = ?', featureId, userId, role)
}

export interface MiniAssignee { feature_id: string; user_id: string; name: string; avatar_url: string | null }

// All assignees of a role across features (for table columns), grouped client-side by feature_id.
export function assigneesByRole(role: AssigneeRole): MiniAssignee[] {
  return all<MiniAssignee>(
    `SELECT a.feature_id, a.user_id, u.name, u.avatar_url
     FROM feature_assignees a JOIN users u ON u.id = a.user_id
     WHERE a.role = ? ORDER BY a.assigned_at`,
    role,
  )
}
