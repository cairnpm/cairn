# Intake & gateway — règles et fonctionnement

> Source de vérité : `server/gateway/intake.ts` (machine à états + commit),
> `server/llm/anthropic.ts` (prompts de l'agent), `server/domain/betting.ts` +
> `server/domain/bet.ts` (menu de pari + bets), `server/db/stale.ts` (anti-backlog).
> Ce document décrit le comportement réel du code, pas une intention.

## 1. Philosophie — Shape Up, bottom-up

Bicycle est un **Product OS bottom-up** : on ne remplit pas un backlog à la main, on
laisse **les signaux remonter** et se condenser en features _shapées_, puis _bettables_,
puis regroupées dans des **Hills** (cycles). Inspiration directe de **Shape Up** :

- On **shape** avant de parier : un signal brut devient un _pitch_ (problème réel,
  appétit, solution esquissée, rabbit holes, no-gos) — pas une demande reformulée.
- On **parie** explicitement (humain), jamais automatiquement : un pari crée/peuple un Hill.
- **Anti-backlog** : ce qui n'est pas parié se périme (`stale`) et doit être re-défendu.
- **Pas de réouverture** d'une solution livrée : on shape une nouvelle itération liée.

Le flux complet, de bas en haut :

```
signal brut ──intake──▶ feature (shaped) ──menu scoré──▶ betting table ──vote──▶
   owner valide ──▶ Hill (cycle actif) + features pariées (bet → building → done)
```

L'**intake est l'unique porte d'écriture** vers le domaine. `intakeCommit()` est le seul
chemin qui INSERT/UPDATE `features` / `feedback`. Les vues (Backlog, Betting, Hills) sont
en lecture seule ; les seules autres écritures sont les **décisions** (bet/pass/defer) et
la **validation** d'une betting table — toutes deux passant par `recordDecision()`.

## 2. Le cycle de vie (statuts)

`feedback` (signal brut) — statut : `new | routed | pending_review | archived`.

`features` — statut : `raw → shaped → bet → building → done`, plus `archived` (fusionnée)
et `deleted` (soft-delete réversible). Transitions :

| De → vers | Déclencheur |
|---|---|
| ∅ → `shaped` | intake `create_feature` (toute nouvelle feature naît shaped, `signal_count=1`) |
| `shaped` → `shaped` (enrichie) | intake `append` (rattache un signal + affine le pitch, `signal_count+1`, `stale=0`) |
| `shaped` → `bet` | `recordDecision('bet')` (validation d'une betting table ou décision manuelle) → `hill_id` posé |
| `shaped` → `shaped` (stale) | non parié depuis `NUXT_STALE_DAYS` (14j) → `stale=1`, à re-défendre |
| `*` → `archived` | feature absorbée par un `merge` |
| `done`/`archived` → **nouvelle itération** | intake `refine` sur une feature livrée → `create_feature` avec `supersedes_id` |
| `*` → `deleted` | suppression (soft) ; réactivable → `prev_status` |

`pass` / `defer` ne changent **pas** le statut (la feature reste `shaped`, sans auto-carry ;
`pass` et `defer` pénalisent juste son score au prochain menu).

## 3. La machine à états de l'intake

Un tour = `POST /api/intake/turn`. La conversation est bornée puis converge toujours
vers une **proposition** que l'humain confirme (`POST /api/intake/commit`).

```
                 detectIntent(message)
                        │
        ┌───────────────┼────────────────┬──────────────┐
      query           signal           refine          merge
   (lecture seule)      │            (feature nommée) (2 features)
        │               ▼                 │              │
   answerQuery     ┌─ gather ◀────────────┴──────────────┘
   (pas d'écrit)   │     │ clarify (boucle bornée : 1 question ciblée à la fois)
                   │     ▼
                   └▶ propose ──(confiance faible, mode signal)──▶ pending_review
                         │                                       (humain arbitre)
                         ▼
                  commit  ←── SEULE écriture domaine
```

- **`gather` → `clarify`** : tant que l'agent ne pourrait pas écrire un pitch confiant, il
  pose **une** question de shaping. Boucle bornée par `MAX_CLARIFY` (8 questions agent) et
  `MAX_TURNS` (18, plafond de sécurité qui force la proposition).
- **`propose`** : l'agent produit une **action** + un **pitch** (`proposed_spec`) + une
  confiance + un rationale. Rien n'est écrit.
- **`pending_review`** : en mode `signal`, si `confidence < NUXT_CONFIDENCE_THRESHOLD`
  (0.45), l'agent **n'écrit pas** et demande à l'humain de trancher (créer vs rattacher à
  un candidat). `refine` / `merge` sont des directives explicites → pas d'arbitrage.
- **`commit`** : applique la proposition dans une transaction. Idempotent par `content_hash`.

> **Mode `query` (recherche transverse, lecture seule)** : l'agent répond depuis un **snapshot
> de tout le produit** (`workspaceContext`) — compteurs du backlog, features `shaped`, travaux
> en cours par cycle, livrés récents, **Hills** avec avancement (%), betting tables, activité
> récente — plus le détail de la feature en focus si la question en nomme une. Il peut donc
> répondre à « quels Hills sont actifs et à quel avancement ? », « qu'a-t-on livré ? », « où en
> est la feature Y ? ». À chaque tour l'intent est **re-détecté** : on peut poser une question
> puis basculer en écriture (« ok crée un ticket pour X » / « affine la feature Y ») sans
> repartir d'une nouvelle session. La réponse est **ancrée** sur le snapshot (« si l'état ne
> répond pas, le dire ; ne rien inventer »).

## 4. Les 4 intents / actions de routage

`detectIntent` classe le message en `query | signal | refine | merge` (schéma strict,
`temperature: 0`). Le `propose` produit une `action` parmi `create_feature | append | discard`
(le `merge` est résolu en amont, hors LLM). Effets au commit :

| Action | Quand | Effet sur le domaine |
|---|---|---|
| `create_feature` | aucun candidat n'est la même feature ; ou `refine` d'une feature **livrée** | INSERT feature `shaped` (`supersedes_id` si nouvelle itération) ; event `created` |
| `append` | un candidat **`shaped`** traite le **même problème** ; ou `refine` d'une feature **`shaped`** | UPDATE feature (champs affinés before→after), `signal_count+1`, `stale=0`, re-embed ; event `signal_added` (digest des champs modifiés) |
| `merge` | directive explicite « fusionne X et Y » / « X est un doublon de Y » | rapatrie feedback/decisions/PR/events de l'absorbée → survivante, pitch consolidé, absorbée `archived` ; events `merged` des deux côtés |
| `discard` | **vrai bruit** (spam/test/hors-produit) ou doublon **exact** qui n'apporte rien — **jamais** un bug | feedback `archived`, aucune mutation de feature ; event `discarded` (si cible) |

Le `feedback` brut est **toujours** stocké (même un `discard` → `archived`), avec son
`content_hash`, son `embedding` et son `classification` (`musing | explore | directive`).

## 5. Déduplication — toujours, à deux niveaux

La dédup n'est pas optionnelle : **chaque tour** passe par une recherche de candidats, et
le commit re-vérifie l'idempotence.

### 5.1 Sémantique (à chaque tour) — `topCandidates()`

- Embedding local du signal, **similarité cosinus** contre les features `status = 'shaped'`
  **uniquement** → top‑5, seuil plancher `CANDIDATE_FLOOR` (0.15).
- **Important** : les seules cibles d'`append` sont les features **`shaped`**. Tout le reste
  (`done`, `archived`, `deleted`, **et les `bet`/`building` déjà engagées dans un cycle**) est
  exclu des candidats — un signal ne se rattache **jamais** à du livré ni à un pari en cours
  (voir §6). Les features en cycle sont injectées séparément en **contexte roadmap** (read-only).
- L'agent agit en **juge de dédup** (prompt `propose`) : le score est un _indice_, pas une
  règle. S'il existe un candidat qui traite **le même problème de fond** — même formulé très
  différemment — il choisit `append`. Il ne choisit `create_feature` que si **aucun**
  candidat n'est réellement la même feature (« créer est un acte délibéré ; les doublons
  polluent le backlog »). Il choisit `discard` si l'apport est nul.

### 5.2 Exacte (au commit) — idempotence

- `content_hash = sha256(raw normalisé)`. Si un feedback avec ce hash a déjà été routé vers
  une feature → **no-op idempotent** (réponse `idempotent: true`, aucune double écriture).

### 5.3 Garde anti-écho

À l'`append`, un champ du pitch n'est **jamais** écrasé par l'instruction brute de
l'utilisateur (détection d'écho) : le stub hors-ligne ne peut pas dégrader un pitch shapé.

## 6. On n'amende que les features `shaped` (ni livrées, ni déjà en cycle)

Règle Shape Up « fixed scope » : on ne fait pas grossir le périmètre d'un pari en cours, et on
ne rouvre pas du livré. **Seules les features `shaped` sont amendables** (`append`/`refine`).
Quatre mécanismes le garantissent :

1. **Périmètre de dédup** : `topCandidates` ne cherche que dans `status = 'shaped'` → pas de
   rattachement à une feature livrée **ni à une feature `bet`/`building` déjà en cycle**.
2. **Refine sur livré → nouvelle itération** : un `refine` ciblant une feature `done`/`archived`
   ne fait **pas** d'`append` — bascule en `create_feature` avec `supersedes_id` vers la version
   livrée (« pas de réouverture »). Event `created` avec `{ supersedes }`.
3. **Refine sur feature en cycle → nouvelle feature** : un `refine` ciblant une feature
   `bet`/`building` ne modifie **pas** le périmètre du pari en cours — l'agent propose une
   **nouvelle feature** « pour un prochain cycle ».
4. **Contexte roadmap + garde-fou décisions** : les features en cycle sont injectées en contexte
   read-only (« périmètre figé — ne pas amender ») ; et un verdict `bet`/`pass`/`defer` sur une
   feature `done`/`archived` est rejeté (409) côté `decisions.post.ts`.

## 7. Comment l'agent challenge la prise de contexte (router correctement)

Posture explicite : l'agent est un **PM senior qui protège une roadmap finie, pas un order-taker
ni un yes-man**. Il privilégie la **bonne décision** sur l'accord avec l'utilisateur. Cadrage
inspiré des best practices anti-sycophantie (« ask, don't tell » ; faire remonter les hypothèses ;
prioriser l'exactitude sur l'accord) et des questions critiques de Shape Up. Quatre leviers :

### 7.1 Shaping sceptique (prompt `clarify`)

L'agent **n'accepte pas la demande telle quelle** et ne flatte pas. Il :

- **reformule la demande en problème** (ce qui casse concrètement aujourd'hui, pour qui, à
  quelle fréquence) avant toute solution ;
- **challenge** comme un PM : le problème compte-t-il vraiment ? pourquoi maintenant plutôt
  qu'autre chose ? quel est le coût de faire ça plutôt qu'autre chose ? c'est quoi le succès ?
- **interroge l'appétit** (small = jours / big = semaines) et sa justification ;
- **flague le non-borné** (rabbit holes ouverts, succès flou, scope qui peut exploser) — il ne
  fait pas semblant que c'est bettable. Un pitch bettable est **rough + solved + bounded** ;
- pose **une seule** question tranchante à la fois, autant de tours que nécessaire (pas de
  rembourrage) ; répond **`OK`** dès qu'il pourrait écrire un pitch confiant **ou** conclure qu'il
  n'y a pas de vrai problème à shaper (pur bruit). Un problème peu prioritaire mais réel **reste**
  à shaper — le timing se décide au pari, pas à l'intake.

Détection de fin : un `OK` explicite, ou une réponse sans `?` → on passe à `propose`.

### 7.2 Juge de dédup + PM critique (prompt `propose`)

Le prompt injecte le **contexte produit** (`ARCHITECTURE_CONTEXT`), les candidats similaires **et
le contexte roadmap** (cycles actifs + features en cours). Il demande de :

- **juger le sens, pas les nombres** — `append` si un candidat est la même feature ;
  `create_feature` seulement pour une vraie nouveauté ;
- **`discard` étroit** : uniquement le **vrai bruit** (spam, test, hors-produit) ou un doublon
  **exact** qui n'apporte rien. Un **bug est in-scope** (l'intake est la porte d'entrée des bugs) →
  on le shape en pitch de correction, **jamais** « ça va dans Jira ». « Pas maintenant » / faible
  priorité **n'est pas** un motif de discard (c'est une décision de pari) — défaut = **capturer** ;
- respecter le **périmètre figé** des features en cycle (jamais d'`append` → nouvelle feature) ;
- **faire remonter ses hypothèses** et le **contexte manquant** dans le `rationale`, en séparant
  fait et interprétation.

### 7.3 Arbitrage humain sous incertitude

- En mode `signal`, `confidence < 0.45` → `pending_review` : l'agent expose les candidats
  (avec %) et **demande à l'humain de trancher** plutôt que de deviner.
- L'humain confirme/corrige **toujours** la proposition avant écriture (« Tu confirmes, ou
  tu corriges ? »). On mesure la qualité du modèle via `routing_log.corrected` (l'humain
  a-t-il changé la **première** proposition de l'agent : action ou cible différente).

## 8. Merge & regroupement (group)

Deux notions distinctes :

- **Merge (intake)** — directive humaine « fusionne X et Y ». L'agent résout **survivante**
  (target2, conservée) et **absorbée** (target). Au commit : feedback/decisions/PR/events de
  l'absorbée re-parentés sur la survivante, pitch **consolidé** (Claude réécrit en couvrant
  les deux), `signal_count` additionnés, absorbée passée `archived`. Si une seule des deux est
  résolue → traité comme un `refine` ; si aucune → `signal`.
- **Group (betting menu)** — regroupement **thématique** automatique du menu de pari par
  clustering glouton sur les embeddings (`CLUSTER_THRESHOLD = 0.4`). Chaque candidat reçoit un
  `theme`. C'est de la présentation/priorisation, ça ne mute aucune feature.

## 9. Du shaped au bettable, puis au Hill

### 9.1 Menu scoré (`computeMenu`)

Seules les features `shaped` entrent au menu. Score :

```
score = (1 + signal_count) × recency × appetite × deferPenalty × stalePenalty
```

| Facteur | Valeur |
|---|---|
| `recency` | `exp(-ageDays / 21)` (demi-vie ~3 semaines, sur `updated_at`) |
| `appetite` | `big = 1.3`, sinon `1` |
| `deferPenalty` | dernière décision `defer = 0.8`, `pass = 0.5`, sinon `1` |
| `stalePenalty` | `stale = 0.6`, sinon `1` |

Puis clustering thématique (§8) → menu rangé par score, groupé par thème. Partagé par
l'aperçu live et le **snapshot** figé d'une betting table (mêmes rangs).

### 9.2 Betting table → vote → Hill

1. **Snapshot** : créer une betting table fige le menu courant (les features bougent ensuite,
   la table reste stable). Candidats dénormalisés (`title_snap`, `problem_snap`, …).
2. **Vote** : chaque membre vote (toggle) ; tally + avatars des votants ; timeline d'events.
3. **Validation (owner uniquement)** : crée un **Hill** `active` `{name, starts_at, ends_at}`.
   Pour chaque candidat sélectionné **encore `shaped`** → `recordDecision('bet')` (feature
   `bet`, `hill_id` posé, event `bet`). Un candidat qui a changé de statut depuis le snapshot
   (déjà `bet`/`done`/`archived`/fusionné) est **skippé**, jamais réouvert. La table passe
   `validated`, event `validated` avec `{ hill_id, bet, skipped }`.

Le **« pourquoi »** d'un Hill = la rationale de validation (partagée par ses décisions de
pari), affichée au-dessus des features pariées.

## 10. Tracking de tout l'historique (audit)

Tout est tracé, append-only :

| Table | Contenu |
|---|---|
| `feature_events` | timeline par feature : `created`, `signal_added` (contenu du signal + champs affinés before→after), `merged`, `discarded`, `bet`/`pass`/`defer`, `stale`, `pr_linked`/`pr_merged`, `deleted`/`restored`. `actor_type` = `user | agent | system`. |
| `routing_log` | chaque décision de routage : `action`, `target_feature_id`, `confidence`, `rationale`, `model`, **`corrected`** (humain a changé la 1re proposition). |
| `feedback` | chaque signal brut conservé (même `discard` → `archived`), avec `classification`, `content_hash`, `embedding`. |
| `decisions` | chaque `bet`/`pass`/`defer` avec `rationale` (le « pourquoi » obligatoire) + `hill_id`. |
| `betting_events` | timeline d'une table : `generated`, `vote_cast`/`vote_cleared`, `validated`, `cancelled`, `deleted`/`restored`. |

**Attribution** : l'acteur est dérivé de la **session authentifiée** au moment du commit
(qui commit, pas qui ouvre la session) — jamais lu depuis le body.

## 11. Constantes (réglables)

| Constante | Défaut | Env | Rôle |
|---|---|---|---|
| `CONFIDENCE_THRESHOLD` | 0.45 | `NUXT_CONFIDENCE_THRESHOLD` | sous ce seuil (mode signal), l'humain arbitre |
| `CANDIDATE_FLOOR` | 0.15 | — | similarité minimale pour entrer dans la liste de candidats |
| `TOP_K` | 5 | — | nombre de candidats de dédup |
| `MAX_TURNS` | 18 | — | plafond de tours (force la proposition) |
| `MAX_CLARIFY` | 8 | — | plafond de questions de l'agent |
| `CLUSTER_THRESHOLD` | 0.4 | — | seuil de clustering thématique du menu |
| `STALE_DAYS` | 14 | `NUXT_STALE_DAYS` | jours sans pari → `stale` |

> Le LLM est derrière une seule interface (`LlmProvider`) : Anthropic quand une clé est
> présente, sinon un **stub déterministe** (le gateway ne se bloque jamais). Les embeddings
> restent **locaux**. Toute réponse du modèle qui échoue dégrade vers le stub.

## 12. Tests bout-en-bout (rejouables)

Suite `tests/intake.test.ts` (vitest) qui exerce tout le flux directement via la gateway
(`intakeTurn` → `intakeCommit`), sur une **DB SQLite temporaire** (jamais `.data/app.db`).

```bash
pnpm test:intake                      # RÉALISTE — vrai LLM (clé lue dans .env), modèle Sonnet
INTAKE_TEST_STUB=1 pnpm test:intake   # HEURISTIQUE — stub déterministe, offline
ANTHROPIC_MODEL=claude-opus-4-8 pnpm test:intake     # forcer un modèle
```

Scénarios : **création** (signal nouveau → feature shapée), **déduplication / amend** (un
complément enrichit la feature existante → `append`, pas de doublon — *réel uniquement*, le
stub à seuil ne réplique pas ce jugement), **merge** (fusion de deux features nommées → une
archivée, l'autre survit), **query** (question → réponse, aucune écriture), **fixed scope**
(un signal proche d'une feature déjà en cycle ne l'amende pas).

> Les tests réels sont **non déterministes** par nature (le modèle décide) : on utilise Sonnet
> (routage plus consistant que Haiku) et des assertions comportementales. Un vrai problème doit
> toujours être **capturé** (create/append), jamais écarté — c'est précisément ce qu'on vérifie.
