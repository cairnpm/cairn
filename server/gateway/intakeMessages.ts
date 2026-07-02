import type { UiLang } from '../domain/types'

// User-facing wrapper phrases the gateway assembles around the LLM output (routing reflections, batch
// guidance). The LLM output itself is already written in the UI language; these templates match it.
// Kept as plain trilingual functions — the set is small and each has its own interpolation.
const pick = (lang: UiLang | undefined, fr: string, en: string, es: string) =>
  (lang === 'en' ? en : lang === 'es' ? es : fr)
const confirmTail = (lang?: UiLang) => pick(lang, 'Tu confirmes, ou tu corriges ?', 'Confirm, or make a correction?', '¿Confirmas o corriges?')

export const im = {
  merge: (lang: UiLang | undefined, absorbed: string, survivor: string) => pick(lang,
    `Je propose de fusionner « ${absorbed} » dans « ${survivor} » et de consolider le pitch — signaux, décisions et historique rapatriés, l'absorbée archivée. ${confirmTail(lang)}`,
    `I suggest merging “${absorbed}” into “${survivor}” and consolidating the pitch — signals, decisions and history are moved over, the absorbed one archived. ${confirmTail(lang)}`,
    `Propongo fusionar «${absorbed}» en «${survivor}» y consolidar el pitch — señales, decisiones e historial se trasladan, la absorbida se archiva. ${confirmTail(lang)}`),

  supersede: (lang: UiLang | undefined, title: string, shipped: boolean, newTitle: string) => pick(lang,
    `« ${title} » est déjà ${shipped ? 'livrée' : 'archivée'} — pas de réouverture. Je propose une NOUVELLE itération « ${newTitle} » liée à la version précédente. ${confirmTail(lang)}`,
    `“${title}” is already ${shipped ? 'shipped' : 'archived'} — no reopening. I propose a NEW iteration “${newTitle}” linked to the previous version. ${confirmTail(lang)}`,
    `«${title}» ya está ${shipped ? 'entregada' : 'archivada'} — sin reapertura. Propongo una NUEVA iteración «${newTitle}» vinculada a la versión anterior. ${confirmTail(lang)}`),

  frozen: (lang: UiLang | undefined, title: string, status: string, newTitle: string) => pick(lang,
    `« ${title} » est déjà engagée dans un cycle (${status}) — on ne modifie pas le périmètre d'un pari en cours. Je propose une NOUVELLE feature « ${newTitle} » pour un prochain cycle. ${confirmTail(lang)}`,
    `“${title}” is already committed to a cycle (${status}) — we don't touch the scope of an active bet. I propose a NEW feature “${newTitle}” for a future cycle. ${confirmTail(lang)}`,
    `«${title}» ya está comprometida en un ciclo (${status}) — no cambiamos el alcance de una apuesta en curso. Propongo una NUEVA feature «${newTitle}» para un ciclo futuro. ${confirmTail(lang)}`),

  refineAppend: (lang: UiLang | undefined, problem: string, title: string, conf: number) => pick(lang,
    `J'ai compris : « ${problem} ». Je propose d'affiner la feature « ${title} » (${conf}% de confiance). ${confirmTail(lang)}`,
    `Got it: “${problem}”. I propose to refine the feature “${title}” (${conf}% confidence). ${confirmTail(lang)}`,
    `Entendido: «${problem}». Propongo afinar la feature «${title}» (${conf}% de confianza). ${confirmTail(lang)}`),

  signalAppend: (lang: UiLang | undefined, problem: string, title: string, conf: number) => pick(lang,
    `J'ai compris : « ${problem} ». Je propose de le rattacher à la feature « ${title} » (${conf}% de confiance). ${confirmTail(lang)}`,
    `Got it: “${problem}”. I propose to attach it to the feature “${title}” (${conf}% confidence). ${confirmTail(lang)}`,
    `Entendido: «${problem}». Propongo adjuntarla a la feature «${title}» (${conf}% de confianza). ${confirmTail(lang)}`),

  discard: (lang: UiLang | undefined, rationale: string) => pick(lang,
    `Ce signal n'apporte rien de nouveau (doublon / hors-scope) — je propose de l'écarter. ${rationale} ${confirmTail(lang)}`,
    `This signal adds nothing new (duplicate / out of scope) — I propose to discard it. ${rationale} ${confirmTail(lang)}`,
    `Esta señal no aporta nada nuevo (duplicado / fuera de alcance) — propongo descartarla. ${rationale} ${confirmTail(lang)}`),

  create: (lang: UiLang | undefined, problem: string, title: string, appetite: string) => pick(lang,
    `J'ai compris : « ${problem} ». Aucun doublon fort — je propose de créer une nouvelle feature « ${title} » (appétit ${appetite}). ${confirmTail(lang)}`,
    `Got it: “${problem}”. No strong duplicate — I propose to create a new feature “${title}” (appetite ${appetite}). ${confirmTail(lang)}`,
    `Entendido: «${problem}». Sin duplicado claro — propongo crear una nueva feature «${title}» (apetito ${appetite}). ${confirmTail(lang)}`),

  lowConf: (lang: UiLang | undefined, conf: number, cands: string, inner: string) => pick(lang,
    `⚠ Confiance faible (${conf}%). À toi de trancher : créer une nouvelle feature, ou rattacher à un candidat${cands ? ` — ${cands}` : ''} ?\n\n${inner}`,
    `⚠ Low confidence (${conf}%). Your call: create a new feature, or attach to a candidate${cands ? ` — ${cands}` : ''}?\n\n${inner}`,
    `⚠ Confianza baja (${conf}%). Tú decides: crear una nueva feature, o adjuntar a un candidato${cands ? ` — ${cands}` : ''}?\n\n${inner}`),

  question: (_lang: UiLang | undefined, title: string, question: string | null | undefined) => `**${title}** — ${question}`,

  batchAllClear: (lang: UiLang | undefined, total: number) => pick(lang,
    `J'ai repéré **${total} sujets**, tous assez clairs pour être shapés. Voici le récap à valider.`,
    `I found **${total} topics**, all clear enough to shape. Here's the recap to review.`,
    `Detecté **${total} temas**, todos suficientemente claros para dar forma. Aquí está el resumen para validar.`),

  batchHead: (lang: UiLang | undefined, total: number, ready: number, need: number) => pick(lang,
    `J'ai repéré **${total} sujets**. ${ready > 0 ? `${ready} ${ready > 1 ? 'sont clairs' : 'est clair'}, ` : ''}${need} ${need > 1 ? 'ont' : 'a'} besoin d'une précision de ta part — je te les passe un par un.`,
    `I found **${total} topics**. ${ready > 0 ? `${ready} ${ready > 1 ? 'are' : 'is'} clear, ` : ''}${need} ${need > 1 ? 'need' : 'needs'} input from you — I'll go through them one by one.`,
    `Detecté **${total} temas**. ${ready > 0 ? `${ready} ${ready > 1 ? 'están claros' : 'está claro'}, ` : ''}${need} ${need > 1 ? 'necesitan' : 'necesita'} una precisión de tu parte — te los paso uno por uno.`),

  batchRecap: (lang: UiLang | undefined, creates: number, appends: number) => pick(lang,
    `C'est clair pour moi. Récap : **${creates} à créer**, **${appends} à rattacher**. Vérifie et valide dans l'écran de validation.`,
    `Clear to me. Recap: **${creates} to create**, **${appends} to attach**. Review and confirm in the validation screen.`,
    `Todo claro. Resumen: **${creates} a crear**, **${appends} a adjuntar**. Revisa y valida en la pantalla de validación.`),
}
