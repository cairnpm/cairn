import type { Appetite, Classification, Proposal } from '../domain/types'
import { localEmbed } from '../utils/embedding'
import type { LlmProvider, ProposeInput } from './provider'

/** Strong-match threshold: above this, attaching to an existing feature is the default. */
export const DEDUP_STRONG = 0.55

const DIRECTIVE = /\b(bug|crash|cass[ée]|broken|urgent|critique|bloquant|asap|il faut|production|prod|r[ée]gression)\b/i
const EXPLORE = /\b(feature|fonctionnalit[ée]|id[ée]e|idea|int[ée]gration|support|ajout|ajouter|add|am[ée]liorer|pourrait|serait|redesign|refonte)\b/i
const BIG = /\b(gros|grosse|large|semaines|refonte|redesign|sso|enterprise|migration|multi|complet|complète)\b/i

export function heuristicClassify(content: string): Classification {
  if (DIRECTIVE.test(content)) return 'directive'
  if (EXPLORE.test(content) || content.includes('?')) return 'explore'
  return 'musing'
}

function detectAppetite(content: string): Appetite {
  return BIG.test(content) ? 'big' : 'small'
}

function makeTitle(raw: string): string {
  const clean = raw.trim().replace(/\s+/g, ' ')
  const firstSentence = clean.split(/[.!?\n]/)[0] || clean
  const t = firstSentence.length > 64 ? firstSentence.slice(0, 61).trimEnd() + '…' : firstSentence
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

const REFINE_RE = /\b(sur (le |la )?(ticket|feature|pitch)|affiner|affine|pr[ée]cise|pr[ée]ciser|raffine|mets? [àa] jour|modifie|enrichi[rs]?)\b/i
const QUERY_RE = /\b(o[ùu] en (est|sommes|sont)|avancement|statut|status|[ée]tat|combien|c'est quoi|qu'en est|on en est)\b/i
const MERGE_RE = /\b(fusionne|fusionner|fusion|merge|doublon de)\b/i

/** Extract a feature-name search string from a refine/query message. */
function extractTarget(message: string): string {
  const m = message.match(/(?:ticket|feature|pitch)\s+«?\s*([^,.?»\n]+)/i)
  return (m ? m[1] : message).trim()
}

/** Extract (absorbed, surviving) feature names from a merge instruction. */
function extractMergePair(message: string): { target: string | null, target2: string | null } {
  // "X est un doublon de Y" → absorb X into Y
  const dup = message.match(/(.+?)\s+est un doublon de\s+(.+)/i)
  if (dup) return { target: dup[1].replace(MERGE_RE, '').trim(), target2: dup[2].trim() }
  // "fusionne X et Y" / "fusionne X dans Y"
  const pair = message.replace(MERGE_RE, '').match(/(.+?)\s+(?:et|dans|avec)\s+(.+)/i)
  if (pair) return { target: pair[1].trim(), target2: pair[2].trim() }
  return { target: extractTarget(message), target2: null }
}

/** Deterministic, offline provider. No network. */
export function createStubProvider(): LlmProvider {
  return {
    name: 'stub',
    embed: async (text: string) => localEmbed(text),

    detectIntent: async (message: string) => {
      if (MERGE_RE.test(message)) {
        const { target, target2 } = extractMergePair(message)
        return { intent: 'merge', target, target2 }
      }
      if (REFINE_RE.test(message)) return { intent: 'refine', target: extractTarget(message), target2: null }
      if (QUERY_RE.test(message) || (message.trim().endsWith('?') && /\b(feature|ticket|pitch)\b/i.test(message))) {
        return { intent: 'query', target: extractTarget(message), target2: null }
      }
      return { intent: 'signal', target: null, target2: null }
    },

    answerQuery: async (_question: string, context: string) => `Voici l'état actuel :\n\n${context}`,

    classify: async (content: string) => heuristicClassify(content),

    clarify: async ({ raw, transcript }) => {
      // Shaping discipline (§4): force a real problem statement + appetite + out-of-bounds
      // rather than a reworded request. Ask at most twice, then converge to a proposal.
      const agentQuestions = transcript.filter(t => t.role === 'agent' && t.text.includes('?')).length
      if (agentQuestions >= 3) return null

      const userText = [raw, ...transcript.filter(t => t.role === 'user').map(t => t.text)].join(' ')
      const hasAppetite = BIG.test(userText) || /\b(small|petit|rapide|jour|jours|semaine|semaines)\b/i.test(userText)
      const thin = wordCount(userText) < 12

      if (agentQuestions === 0) {
        return 'Pour bien shaper : qu\'est-ce qui ne va vraiment pas / qu\'est-ce qui casse aujourd\'hui ? '
          + 'Décris le problème concret, pas la solution.'
      }
      if (!hasAppetite || thin) {
        return 'Et l\'appétit — small (quelques jours) ou big (quelques semaines) ? '
          + 'Y a-t-il un hors-périmètre explicite (ce qu\'on ne fera PAS) ?'
      }
      return null
    },

    propose: async ({ raw, candidates, classification, transcript }: ProposeInput) => {
      // Fold any clarifying answers into the material we shape from.
      const userText = [raw, ...transcript.filter(t => t.role === 'user').map(t => t.text)].join(' ')
      const top = candidates[0]
      const attach = top && top.similarity >= DEDUP_STRONG
      const appetite = detectAppetite(userText)

      const proposal: Proposal = attach
        ? {
            action: 'append',
            target_feature_id: top.feature_id,
            classification,
            confidence: Number(top.similarity.toFixed(2)),
            rationale: `Forte similarité (${(top.similarity * 100).toFixed(0)}%) avec « ${top.title} ». Rattachement proposé par défaut — créer une nouvelle feature reste une action délibérée.`,
            proposed_spec: { title: top.title, problem: raw.trim(), appetite, solution: '', rabbit_holes: '', out_of_bounds: '' },
            candidates,
          }
        : {
            action: 'create_feature',
            target_feature_id: null,
            classification,
            confidence: Number((1 - (top?.similarity ?? 0)).toFixed(2)),
            rationale: top
              ? `Meilleur candidat « ${top.title} » à ${(top.similarity * 100).toFixed(0)}% (< seuil ${DEDUP_STRONG * 100}%). Nouvelle feature proposée.`
              : 'Aucun doublon proche trouvé. Nouvelle feature proposée.',
            proposed_spec: { title: makeTitle(raw), problem: raw.trim(), appetite, solution: '', rabbit_holes: '', out_of_bounds: '' },
            candidates,
          }
      return proposal
    },
  }
}
