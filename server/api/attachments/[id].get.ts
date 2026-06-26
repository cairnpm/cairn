import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { ensureSchema } from '~~/server/db/schema'
import { getAttachment, uploadsDir } from '~~/server/db/attachments'

// Serve a stored file (behind the global auth middleware).
export default defineEventHandler((event) => {
  ensureSchema()
  const id = getRouterParam(event, 'id')!
  const a = getAttachment(id)
  if (!a) throw createError({ statusCode: 404, statusMessage: 'Attachment not found' })
  setResponseHeader(event, 'content-type', a.mime)
  setResponseHeader(event, 'content-disposition', `inline; filename="${encodeURIComponent(a.filename)}"`)
  return sendStream(event, createReadStream(join(uploadsDir(), a.storage_path)))
})
