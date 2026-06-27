/**
 * Short architecture summary injected into the shaping prompt so proposed solutions /
 * rabbit holes are grounded in this product's reality (brief: agent §3.4). Keep it terse —
 * NOT the whole repo. Fine code exploration happens in Claude Code at build time, not here.
 */
export const ARCHITECTURE_CONTEXT = `Produit : « Bicycle — Product OS », un pipeline produit Shape Up contraint.
Stack : Nuxt 4 + Nitro (server routes = la write gateway, seul chemin d'écriture), node:sqlite
(SQLite fichier, 1 machine), shadcn-vue (UI lecture seule + actions). Embeddings stockés en JSON,
dédup par cosine brute-force JS.
Domaine : feedback (signal brut) → feature/pitch (problème, appétit, solution, rabbit holes,
no-gos ; agrège plusieurs feedback) → hill (cycle) → decision (bet/pass/defer). Journal
d'activité append-only par feature.
Signaux : un signal peut être un bug, une demande, une idée — TOUS sont des signaux produit à
capturer ici (l'intake EST la porte d'entrée de l'équipe, y compris pour les bugs). Un bug devient
un pitch de correction (problème = le bug). On ne renvoie JAMAIS un signal vers un autre outil.
Conventions : tout passe par la gateway ; l'écriture n'a lieu qu'à la confirmation humaine ;
pas de Notion-bis, pas de backlog qui pourrit.`
