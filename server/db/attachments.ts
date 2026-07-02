import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { all, dataDir, get, run } from './client'
import { newId } from '../utils/id'

export interface Attachment {
  id: string
  feature_id: string | null
  feedback_id: string | null
  filename: string
  mime: string
  bytes: number
  kind: string
  storage_path: string
  uploaded_by: string | null
  created_at: string
}

export function uploadsDir(): string {
  const dir = join(dataDir(), 'uploads')
  try { mkdirSync(dir, { recursive: true }) } catch { /* exists */ }
  return dir
}

/** Coarse kind from MIME — drives extraction (vision for image, inline for text, parser for
 *  document) at intake, and UI rendering. */
export function kindFor(mime: string): 'image' | 'text' | 'document' | 'other' {
  if (mime.startsWith('image/')) return 'image'
  // .docx/.doc → parsed to text. MUST precede the xml/text check below: the docx mime
  // (application/vnd.openxmlformats-officedocument.wordprocessingml.document) contains "xml".
  if (/(wordprocessingml|msword)/.test(mime)) return 'document'
  if (mime.startsWith('text/') || /(json|markdown|csv|xml|yaml)/.test(mime)) return 'text'
  return 'other'
}

export function insertAttachment(a: Omit<Attachment, 'created_at'>): void {
  run(
    `INSERT INTO attachments (id, feature_id, feedback_id, filename, mime, bytes, kind, storage_path, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    a.id, a.feature_id, a.feedback_id, a.filename, a.mime, a.bytes, a.kind, a.storage_path, a.uploaded_by,
  )
}

export function getAttachment(id: string): Attachment | undefined {
  return get<Attachment>('SELECT * FROM attachments WHERE id = ?', id)
}

export function listByFeature(featureId: string): Attachment[] {
  return all<Attachment>('SELECT * FROM attachments WHERE feature_id = ? ORDER BY created_at', featureId)
}

/** Attach uploaded files (by id) to the feature/feedback they were committed with. */
export function linkAttachments(ids: string[], featureId: string | null, feedbackId: string | null): void {
  for (const id of ids) {
    run('UPDATE attachments SET feature_id = COALESCE(?, feature_id), feedback_id = COALESCE(?, feedback_id) WHERE id = ?', featureId, feedbackId, id)
  }
}

/** Duplicate source attachments (by id) onto a feature/feedback — same file, fresh rows. Used when ONE
 *  uploaded source (e.g. a transcript) is decomposed into several features: each feature gets its own
 *  row pointing at the shared storage_path, so the source stays traceable on every signal it spawned. */
export function cloneAttachmentsTo(sourceIds: string[], featureId: string, feedbackId: string | null): void {
  for (const id of sourceIds) {
    const a = getAttachment(id)
    if (!a) continue
    insertAttachment({ ...a, id: newId(), feature_id: featureId, feedback_id: feedbackId })
  }
}
