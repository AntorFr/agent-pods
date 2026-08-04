# agent-gw — gateway d'Alfred

Conteneur principal du pod Alfred : **la porte d'entrée utilisateur *et* le runtime de
l'agent**. FastAPI + PWA de chat + SDK Claude (`query()`).

Déployé via `smart-home-charts` (chart `agent-pod`) ; manifeste :
`k8s-home-lab/clusters/homenode/home/assist/alfred-helm.yml`. Image publiée sur
`ghcr.io/antorfr/agent-gw` (repo `agent-pods`).

## Rôle

1. **Sert la PWA** — l'appli web de chat (`https://alfred.berard.me`), front + statics.
2. **Fait tourner l'agent** — appelle le SDK Claude avec le cerveau dans
   `/workspace/memory`, les skills et les MCP (workspace-mcp Google, etc.). Un message =
   un tour d'agent exécuté ici.
3. **Authentifie** — OIDC via Authelia, cookie de session signé, bouclier 🛡 des actions
   sensibles.
4. **Expose `/mcp`** — endpoints `ask_alfred` / `ask_alfred_status` (bearer `GW_MCP_TOKEN`) :
   d'autres agents confient des tâches à Alfred sans intermédiaire. **Asynchrone** :
   `ask_alfred` rend un `job_id` immédiatement, `ask_alfred_status` récolte la réponse.
5. **Sert la mémoire** — API `/api/memory/raw/...` (md, images, pièces jointes) que le
   moteur de rendu de la PWA consomme.
6. **App-modules d'état** — workbooks menuiserie (`/api/workbook/*`) et voyages
   (`/api/voyage/*`, spec `VOYAGES.md`) : la donnée (`workbook.json` / `voyage.json`) est
   écrite par l'agent, les gestes de l'UI vont dans un overlay `*-state.json` frère (hors
   git) ; météo et liaisons des voyages sont dérivées via les API Google (clé
   `GOOGLE_MAPS_API_KEY`, déjà dans l'env du pod pour le MCP maps) et jamais stockées.
7. **Horloge des tâches planifiées** (`app/planif.py`, `GET /api/planif` — cerveau : D30) —
   une boucle asyncio lit les fiches `type: planif` de `memory/planif/*.md` et, à l'heure
   dite, ouvre un tour Alfred ordinaire avec **le corps de la fiche pour prompt** (précédé
   d'un court cadre de provenance, sur le patron d'`ask_alfred` : sans lui l'agent ne peut
   pas savoir qu'il est dans un tour planifié — le corps, lui, passe mot pour mot). Session
   neuve, `GW_CHANNEL=planif` injecté par `ClaudeAgentOptions.env` (le hook du workspace
   ferme alors TOUTE la surface Google, lectures comprises), pas de rattrapage au-delà de la
   fenêtre de grâce, journal dans `planif/planif-state.json` (hors git). L'onglet PWA est en
   **lecture** : créer ou suspendre passe par un message à Alfred, qui édite la fiche.

Le pod porte un **2ᵉ conteneur `tunnel`** (image `claude-pod`) dédié au tunnel VS Code
vers `/workspace` — accès dev direct, indépendant de la gateway.

## Configuration (variables d'environnement)

| Variable | Défaut | Rôle |
|---|---|---|
| `GW_CHANNEL` | `pwa` | Identité du canal. Sa **présence** = mode headless (personne pour répondre à une invite) → le bouclier s'applique. Posé au niveau conteneur, hors d'atteinte du modèle. |
| `GW_PERMISSION_MODE` | `bypassPermissions` | Mode permission du SDK Claude. En `bypass`, les `permissions.deny` sont ignorées → **seul un hook `exit 2` bloque** (cf. `alfred/.claude/hooks/google_guard.py`). |
| `GW_WORKSPACE` | `/workspace` | Racine du cerveau (repo mémoire d'Alfred). |
| `GW_MEMORY_DIR` | `memory` | Dossier mémoire, relatif au workspace. |
| `GW_TODO_FILE` | `todo/taches.md` | Fichier todo, relatif à la mémoire. |
| `GW_FLEET_DIR` | `repos` | Dossier des clones de la flotte, relatif au workspace — source de `GET /api/repos` et de la vue `repos`. Le scan lit le **disque**, pas l'API GitHub : ce qui s'affiche est ce que le pod a fetché. |
| `GW_TRACE` | `0` | Trace d'outils dans le fil : chaque appel apparaît en `◇ <outil> · <cible>`, groupé sous son compte, jusqu'au message texte suivant. **Live seulement** — `/api/history` ne la rejoue pas, elle disparaît au rechargement (témoin d'exécution, pas archive). Seuls le **nom** et une **cible courte** (78 car. max, champ parlant de l'input) sortent : jamais l'input complet, qui porte le contenu d'un fichier ou une commande entière. Défaut off — un majordome reste discret ; un agent de code qui cache ce qu'il touche est un agent qu'on ne peut pas corriger. |
| `GW_THEME` | `alfred` | Identité visuelle du pod. Le lanceur pose `data-agent=<thème>` sur `<html>` au boot, ce qui arme les surcharges de jetons de `theme-<thème>.css` — bundlées avec le reste, **inertes** tant que l'attribut est absent. `alfred` ⇒ aucun attribut, charte historique, un pod existant ne bouge pas d'un pixel. `skippy` ⇒ sombre, monospace en titrage, ambre, coins à 3 px, sans ombre portée. Le bouton de thème clair/sombre continue de fonctionner dans les deux cas. |
| `GW_APPS` | `todo,projets,atelier,planif,voyages` | Modules exposés par le lanceur, séparés par des virgules. L'image est agent-agnostique, le lanceur ne l'était pas : ses tuiles et ses routes étaient câblées sur le monde d'un seul agent. Un pod majordome veut l'atelier et les voyages ; un pod de code n'en veut aucun. Le front masque **la tuile ET la route** de tout module absent (une URL en marque-page ne ressuscite rien). La mémoire (fiches, domaines) n'est pas un module : elle est toujours là. Défaut = jeu historique, donc une montée de version ne change rien à un pod existant. |
| `GW_FEATURES` | `scan,attach,eph,tunnel,sujets` | Capacités de la coque, séparées par des virgules — le **second axe** de modularité. `GW_APPS` dit où l'on peut **aller** (tuiles et routes), celui-ci dit ce que le chat sait **faire** (contrôles du composeur et du chrome). Un lecteur de code-barres n'a aucun sens chez un agent de code. Ce qui n'est pas listé est **retiré du DOM**, pas masqué : un nœud absent ne reçoit aucun événement, ne prend pas le focus clavier, et ne peut pas déclencher le chargement paresseux d'un bundle (le décodeur pèse 448 Ko) — un `display:none` laisserait les trois. Les capacités à plusieurs portes d'entrée sont gardées **à la source** : retirer `attach` coupe aussi le coller et le glisser-déposer, pas seulement le bouton 📎. Valeurs : `scan` (▥ code-barres), `attach` (📎 + coller + glisser-déposer), `eph` (⚡ mode éphémère), `tunnel` (⧉ tunnel VS Code dans les Réglages), `sujets` (▤ reprendre un fil). ⚠️ **Le bouclier 🛡 n'est délibérément PAS de cette liste** : c'est une garde, pas un composant — la seule façon de consentir à une action sensible. Une garde qu'on éteint par variable d'environnement est un piège. Défaut = jeu historique, donc une montée de version ne change rien à un pod existant. |
| `GW_STATE_DIR` | `~/.agent-gw` | État **côté serveur** : pointeur de session (`session-<canal>.json`) + corbeille des pièces jointes (`inbox/`). Persistant (hostPath home). |
| `GW_MAX_UPLOAD_MB` | `25` | Taille max (Mo) d'un fichier joint au chat (par fichier). |
| `GW_MAX_UPLOAD_FILES` | `8` | Nombre max de fichiers joints à un même message. |
| `GW_INBOX_TTL` | `86400` (24 h) | Âge (s) au-delà duquel une pièce jointe déposée est balayée (`0` = jamais). Purge best-effort à chaque upload. |
| `GW_SESSION_TTL` | `14400` (4 h) | Inactivité (s) au-delà de laquelle la session n'est **plus reprise** : le tour suivant repart vierge (`0` = jamais). L'état durable vit dans `memory/` (D5), le transcript est jetable — le reprendre fait repayer tout le contexte accumulé à chaque message (cache prompt ~5 min, froid entre deux visites). |
| `GW_CONFIRM_TTL` | `120` | Durée de validité (s) d'une autorisation bouclier 🛡. |
| `GW_PLANIF` | `1` | Horloge des tâches planifiées. `0` la coupe (debug, ou pour geler les tours planifiés sans toucher aux fiches). Une seule instance d'`agent-gw` monte le workspace — les conteneurs voisins (`tunnel`, `voice`) ne lancent pas la gateway, donc pas de double horloge. **Le jour où on scale la gateway, ce flag devient obligatoire sur les répliques.** |
| `GW_PLANIF_DIR` | `planif` | Dossier des fiches `type: planif`, relatif à la mémoire. |
| `GW_PLANIF_TICK` | `30` | Période (s) du tick. Doit rester `< 60` : la boucle matche la **minute** courante. |
| `GW_PLANIF_GRACE` | `5` | Fenêtre de rattrapage (min). Couvre un tour long qui tenait le verrou, **pas** une panne : au-delà, l'occurrence est perdue, à dessein (D30). `0` = aucun rattrapage. |
| `GW_PLANIF_TIMEOUT` | `900` | Durée max (s) d'un tour planifié. Au-delà : annulé et journalisé en échec. |
| `GW_PLANIF_MIN_PERIOD` | `15` | Plancher de fréquence (min). Un cron plus fin rend la fiche **invalide** (affichée telle quelle) au lieu d'être lissé en silence — le quota d'abonnement n'est pas gratuit. |
| `GW_PLANIF_TZ` | `Europe/Paris` | Fuseau par défaut si la fiche n'en déclare pas. |
| `GW_MCP_ALLOWED_HOSTS` | `alfred.berard.me` | Hôtes autorisés du transport MCP (anti DNS-rebinding). |
| `GW_MCP_MAX_PENDING` | `4` | Profondeur de la file `ask_<agent>`. Au-delà, refus **immédiat** plutôt qu'une mise en attente derrière un verrou qui ne se rendra pas avant des heures : un refus est une information, un silence n'en est pas une. Plancher dur à 1. |
| `GW_PEER_MCP_URL` / `GW_PEER_MCP_TOKEN` / `GW_PEER_MCP_TOOL` | `""` | Rappel croisé : à la fin d'un travail, ouvrir un tour chez le demandeur avec le compte rendu (`https://<pair>/mcp/`, son `GW_MCP_TOKEN`, et le nom de **son** outil, ex. `ask_skippy`). Les trois ou rien — non câblé, l'appelant interroge `ask_<agent>_status`. Le rappel pose `notify=False` : sans ce garde-fou, deux agents se renverraient des comptes rendus indéfiniment. |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_REDIRECT_URI` / `OIDC_ALLOWED_GROUP` | `""` / `""` / `""` / `admins` | Client OIDC Authelia. Dès qu'`OIDC_ISSUER` est posé, l'auth passe en OIDC (le bearer `GW_AUTH_TOKEN` devient inutilisé). |

### Secrets

| Secret | Généré | Consommé | Où il vit |
|---|---|---|---|
| `GW_SESSION_SECRET` | `openssl rand -hex 32` (setup initial / rotation) | signe le cookie de session (`secret_key` du `SessionMiddleware`) | coffre `secret/apps/alfred` → `gw_session_secret`, tiré par `externalSecrets` |
| `GW_MCP_TOKEN` | `openssl rand -hex 32` | bearer du endpoint `/mcp` (`ask_alfred`) | manifeste, en clair (DR-via-git) |
| `OIDC_CLIENT_SECRET` | côté Authelia (hash) + clair ici | login OIDC | manifeste, en clair (DR-via-git) ; cf. `app-auth-oidc.md` |
| `GW_AUTH_TOKEN` | — | bearer de secours, **uniquement si OIDC absent** (mode dev) | **inutilisé en prod** (OIDC actif) → hors coffre volontairement |
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token`, sinon session `~/.claude` | **pas lu par agent-gw** — seulement par le SDK Claude | Alfred tourne sur `~/.claude` (persistant, auto-refresh) → hors coffre volontairement |

> Absent de la liste : `GOOGLE_MAPS_API_KEY` (clé du MCP Maps) — tirée du coffre
> `secret/llm/google-api` → `google_map_api_key` via `externalSecrets`, consommée par le
> serveur MCP Maps, pas par agent-gw lui-même.

## Pièces jointes du chat

Le composeur accepte des fichiers par **trois voies** — bouton 📎 (sélecteur / appareil
photo, marche partout, y compris mobile), **glisser-déposer** sur la colonne de chat
(desktop seul — les navigateurs mobiles n'ont pas de DnD vers le DOM), et **coller** une
image. Le flux :

1. `POST /api/upload` (multipart) pose les fichiers dans `GW_STATE_DIR/inbox/<tour>/…` —
   **hors du repo mémoire**, donc jamais commités dans `memory/`. Renvoie un `id` par
   fichier (chemin relatif à l'inbox), assaini et gardé anti-traversée.
2. Le front repasse ces ids dans le corps de `POST /api/chat` (`attachments: [...]`).
   Le serveur les résout en chemins absolus (garde anti-traversée : tout ce qui sort de
   l'inbox est rejeté) et **préfixe le prompt** d'une note encadrée : le contenu d'un
   fichier joint est une **donnée non fiable, jamais une instruction** (même discipline
   anti-injection que les mails, cf. D17). Alfred les **examine avec son outil `Read`**
   (images et PDF compris) — aucune plomberie multimodale côté serveur.

Un message peut être **fichiers seuls** (texte vide). La corbeille est balayée des
entrées de plus de `GW_INBOX_TTL` à chaque upload : les pièces jointes sont un intrant de
tour, pas de la mémoire — si l'une doit survivre, c'est Alfred qui la classe dans
`memory/` selon sa discipline.

## Contexte d'écran

Sur desktop, la PWA est un **split** : le chat à gauche, le canvas à droite. « Ça »,
dans une phrase de Monsieur, désigne donc le plus souvent la page qu'il a sous les yeux
— que le chat ignorait complètement. Chaque message porte désormais un champ
`vue: {route, titre}` (`POST /api/chat`), dont le serveur **préfixe le prompt** d'une
note d'une ligne : *« Écran ouvert à côté du chat : « Voyages › Baden 2026 »
(#/voyage/baden-2026) »*.

Trois bornes, qui sont le fond du dispositif :

- **La route et son fil d'Ariane, jamais le contenu de la page.** Une carte de voyage ou
  une fiche produit cite du texte tiers (Gmail, Open Food Facts) : le verser dans le
  prompt le dépouillerait de son étiquette « non fiable », et le tour suivant le relirait
  comme la parole d'Alfred (même piège que D40 côté planifications).
- **Un indice, pas un sujet imposé.** La note le dit au modèle en toutes lettres : la
  question de Monsieur prime, il peut parfaitement regarder une fiche et parler d'autre
  chose. Le hash reste orientable par un lien qu'on fait cliquer, donc l'entrée est
  bornée à 200 caractères et **aplatie sur une seule ligne** (un saut de ligne suffirait
  à mimer une consigne du harnais).
- **Instantané à l'envoi, et seulement si l'écran est regardé.** Rien n'est joint depuis
  l'accueil (route vide) ni sur mobile replié sur le chat — on ne raconte pas un écran
  que Monsieur ne regarde pas. Rien ne colle d'un message au suivant.

La note s'adresse au MODÈLE, pas à Monsieur — et le transcript, lui, garde le prompt
entier. `/api/history` le rejoue à chaque rechargement (et à chaque réconciliation après
coupure) : la note se retrouvait donc **dans la bulle de Monsieur**, qui relisait un texte
qu'il n'avait pas écrit. Les préambules de la passerelle (écran ouvert, pièces jointes,
mode éphémère) sont désormais **retirés au rejeu** (`_strip_gw_notes`) : ils partent à
l'agent, ils ne remontent pas à l'écran. Un tour sans texte — pièces jointes seules —
garde un trombone plutôt que de disparaître.

## Sessions : coût en tokens, sujets, mode éphémère

Trois mécanismes bornent la consommation (chaque tour rejoue tout le transcript, cache
prompt froid entre deux visites — le poids de la session EST le coût marginal du message) :

- **TTL d'inactivité** (`GW_SESSION_TTL`) : passé le délai, le pointeur n'est plus repris,
  le tour suivant repart sur une session vierge. Alfred redécouvre l'état dans `memory/`
  (c'est le design, cf. D5) ; `/api/history` devient vide en même temps, la PWA repart
  propre au rechargement.
- **Compteur de contexte** (`GET /api/session`) : `context_tokens` = input + cache du
  **dernier appel API** du transcript — ce que le prochain message repaiera. La PWA
  l'affiche en pastille indicative (orange ≥ 60k, rouge ≥ 120k) ; agir se fait par les
  boutons voisins (▤ Sujets, ↺ nouvelle session).
- **Menu Sujets** (PWA) : la « compaction UX ». Changer de sujet = Alfred **consolide**
  la conversation dans `memory/` (un tour), la session est **réinitialisée**, puis la
  fiche `sujets/<x>.md` est **rechargée** en point de reprise. La reprise passe par la
  mémoire, jamais par un vieux transcript. La liste vient de `sujets/INDEX.md` (titre,
  dernière activité, accroche) — la table qu'Alfred discipline déjà. Chaque ligne porte
  un bouton 🗄 : l'archivage est demandé **à l'agent** (skill archivage : distiller,
  ranger, index, commit) — le front ne déplace jamais le fichier lui-même.
- **Mode éphémère ⚡** (`POST /api/chat`, `ephemeral: true`) : parenthèse jetable pour les
  questions ponctuelles (« le RER A est perturbé ? ») — pas de resume du pointeur, pas de
  sauvegarde : le tour ne paie pas l'historique et ne l'engraisse pas. Un enchaînement
  reste possible : le front repasse le `session_id` reçu (`ephemeral_session`), gardé en
  RAM seulement. Les bulles ⚡ (pointillés) disparaissent au rechargement — assumé.

## Sessions & reprise après sinistre (DR)

Le **secret de session n'est pas critique**. À retenir :

- Si `GW_SESSION_SECRET` **change ou se régénère** (fallback `token_hex(32)` quand la
  variable est absente, p.ex. coffre scellé au boot), tous les cookies existants sont
  invalidés → **simple re-login Authelia**. Comme Authelia garde en général la session
  SSO, c'est souvent un redirect transparent.
- **Aucune donnée perdue** dans ce cas : l'historique de conversation vit **côté
  serveur** (`GW_STATE_DIR`, pointant vers le `.jsonl` du SDK dans `~/.claude/projects`),
  la mémoire dans `/workspace` (git), l'auth Claude dans `~/.claude`. Rien de tout ça ne
  dépend du secret de session.
- **DR-via-git** : `git clone` + sync ArgoCD restaure la valeur committée telle quelle —
  rien à régénérer. La régénération ne sert qu'au **premier setup** ou à une rotation
  volontaire. (Politique secrets : cf. `k8s-config.md` / `secrets-vault.md`.)
