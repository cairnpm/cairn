import { writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { ensureSchema } from '~~/server/db/schema'
import { insertAttachment, kindFor, uploadsDir } from '~~/server/db/attachments'
import { newId } from '~~/server/utils/id'

// Multipart upload (h3 built-in — no extra dep). Files land on the same volume as the DB.
// They're created unlinked; the intake commit (or a future ticket action) links them.
export default defineEventHandler(async (event) => {
  ensureSchema()
  const { user } = await requireUserSession(event)
  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'no file' })

  const dir = uploadsDir()
  const saved = []
  for (const part of parts) {
    if (!part.filename || !part.data) continue
    const id = newId()
    const mime = part.type || 'application/octet-stream'
    const ext = extname(part.filename).slice(0, 12)
    const storagePath = `${id}${ext}`
    writeFileSync(join(dir, storagePath), part.data)
    const kind = kindFor(mime)
    insertAttachment({
      id, feature_id: null, feedback_id: null, filename: part.filename, mime,
      bytes: part.data.length, kind, storage_path: storagePath, uploaded_by: user.name as string,
    })
    saved.push({ id, filename: part.filename, mime, kind, bytes: part.data.length })
  }
  return { attachments: saved }
})
