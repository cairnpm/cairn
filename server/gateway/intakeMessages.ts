import type { UiLang } from '../domain/types'

// User-facing wrapper phrases the gateway assembles around the LLM output (routing reflections, batch
// guidance). The LLM output itself is already written in the UI language; these templates match it.
// Kept as plain bilingual functions — the set is small and each has its own interpolation.
const isEn = (lang?: UiLang) => lang === 'en'
const confirmTail = (lang?: UiLang) => (isEn(lang) ? 'Confirm, or make a correction?' : 'Tu confirmes, ou tu corriges ?')

export const im = {
  merge: (lang: UiLang | undefined, absorbed: string, survivor: string) =>
    isEn(lang)
      ? `I suggest merging “${absorbed}” into “${survivor}” and consolidating the pitch — signals, decisions and history are moved over, the absorbed one archived. ${confirmTail(lang)}`
      : `Je propose de fusionner « ${absorbed} » dans « ${survivor} » et de consolider le pitch — signaux, décisions et historique rapatriés, l'absorbée archivée. ${confirmTail(lang)}`,

  supersede: (lang: UiLang | undefined, title: string, shipped: boolean, newTitle: string) =>
    isEn(lang)
      ? `“${title}” is already ${shipped ? 'shipped' : 'archived'} — no reopening. I propose a NEW iteration “${newTitle}” linked to the previous version. ${confirmTail(lang)}`
      : `« ${title} » est déjà ${shipped ? 'livrée' : 'archivée'} — pas de réouverture. Je propose une NOUVELLE itération « ${newTitle} » liée à la version précédente. ${confirmTail(lang)}`,

  frozen: (lang: UiLang | undefined, title: string, status: string, newTitle: string) =>
    isEn(lang)
      ? `“${title}” is already committed to a cycle (${status}) — we don't touch the scope of an active bet. I propose a NEW feature “${newTitle}” for a future cycle. ${confirmTail(lang)}`
      : `« ${title} » est déjà engagée dans un cycle (${status}) — on ne modifie pas le périmètre d'un pari en cours. Je propose une NOUVELLE feature « ${newTitle} » pour un prochain cycle. ${confirmTail(lang)}`,

  refineAppend: (lang: UiLang | undefined, problem: string, title: string, conf: number) =>
    isEn(lang)
      ? `Got it: “${problem}”. I propose to refine the feature “${title}” (${conf}% confidence). ${confirmTail(lang)}`
      : `J'ai compris : « ${problem} ». Je propose d'affiner la feature « ${title} » (${conf}% de confiance). ${confirmTail(lang)}`,

  signalAppend: (lang: UiLang | undefined, problem: string, title: string, conf: number) =>
    isEn(lang)
      ? `Got it: “${problem}”. I propose to attach it to the feature “${title}” (${conf}% confidence). ${confirmTail(lang)}`
      : `J'ai compris : « ${problem} ». Je propose de le rattacher à la feature « ${title} » (${conf}% de confiance). ${confirmTail(lang)}`,

  discard: (lang: UiLang | undefined, rationale: string) =>
    isEn(lang)
      ? `This signal adds nothing new (duplicate / out of scope) — I propose to discard it. ${rationale} ${confirmTail(lang)}`
      : `Ce signal n'apporte rien de nouveau (doublon / hors-scope) — je propose de l'écarter. ${rationale} ${confirmTail(lang)}`,

  create: (lang: UiLang | undefined, problem: string, title: string, appetite: string) =>
    isEn(lang)
      ? `Got it: “${problem}”. No strong duplicate — I propose to create a new feature “${title}” (appetite ${appetite}). ${confirmTail(lang)}`
      : `J'ai compris : « ${problem} ». Aucun doublon fort — je propose de créer une nouvelle feature « ${title} » (appétit ${appetite}). ${confirmTail(lang)}`,

  lowConf: (lang: UiLang | undefined, conf: number, cands: string, inner: string) =>
    isEn(lang)
      ? `⚠ Low confidence (${conf}%). Your call: create a new feature, or attach to a candidate${cands ? ` — ${cands}` : ''}?\n\n${inner}`
      : `⚠ Confiance faible (${conf}%). À toi de trancher : créer une nouvelle feature, ou rattacher à un candidat${cands ? ` — ${cands}` : ''} ?\n\n${inner}`,

  question: (lang: UiLang | undefined, title: string, question: string | null | undefined) => `**${title}** — ${question}`,

  batchAllClear: (lang: UiLang | undefined, total: number) =>
    isEn(lang)
      ? `I found **${total} topics**, all clear enough to shape. Here's the recap to review.`
      : `J'ai repéré **${total} sujets**, tous assez clairs pour être shapés. Voici le récap à valider.`,

  batchHead: (lang: UiLang | undefined, total: number, ready: number, need: number) =>
    isEn(lang)
      ? `I found **${total} topics**. ${ready > 0 ? `${ready} ${ready > 1 ? 'are' : 'is'} clear, ` : ''}${need} ${need > 1 ? 'need' : 'needs'} input from you — I'll go through them one by one.`
      : `J'ai repéré **${total} sujets**. ${ready > 0 ? `${ready} ${ready > 1 ? 'sont clairs' : 'est clair'}, ` : ''}${need} ${need > 1 ? 'ont' : 'a'} besoin d'une précision de ta part — je te les passe un par un.`,

  batchRecap: (lang: UiLang | undefined, creates: number, appends: number) =>
    isEn(lang)
      ? `Clear to me. Recap: **${creates} to create**, **${appends} to attach**. Review and confirm in the validation screen.`
      : `C'est clair pour moi. Récap : **${creates} à créer**, **${appends} à rattacher**. Vérifie et valide dans l'écran de validation.`,
}
