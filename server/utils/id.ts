import { randomUUID } from 'node:crypto'

/** Domain id (uuid v4). */
export function newId(): string {
  return randomUUID()
}
