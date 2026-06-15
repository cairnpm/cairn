/**
 * Deterministic, dependency-free local embedding — a hashed bag-of-words vector.
 * Good enough for brute-force cosine dedup at our scale (hundreds/thousands of rows).
 * Swappable later for a real embedding model behind LlmProvider.embed().
 */
const DIM = 256

const STOP = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'a', 'à', 'au', 'aux',
  'en', 'dans', 'sur', 'pour', 'par', 'que', 'qui', 'quoi', 'est', 'sont', 'ce', 'cet',
  'cette', 'ces', 'on', 'il', 'elle', 'je', 'nous', 'vous', 'se', 'sa', 'son', 'ses',
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'is', 'are', 'it', 'this',
])

function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !STOP.has(t))
}

function hash(token: string): number {
  let h = 2166136261
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % DIM
}

/** Local embedding: tf-weighted, L2-normalized hashed vector. */
export function localEmbed(text: string): number[] {
  const v = new Array<number>(DIM).fill(0)
  for (const tok of tokenize(text)) v[hash(tok)] += 1
  let norm = 0
  for (const x of v) norm += x * x
  norm = Math.sqrt(norm) || 1
  return v.map(x => x / norm)
}

export function cosine(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot // both vectors are L2-normalized
}

/** Embeddings are persisted as JSON text (no sqlite-vec yet — see brief §6). */
export function encodeEmbedding(v: number[]): string {
  return JSON.stringify(v)
}
export function decodeEmbedding(s: string | null | undefined): number[] {
  if (!s) return []
  try { return JSON.parse(s) as number[] } catch { return [] }
}
