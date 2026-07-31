# Status — agent-pods

> MàJ : 2026-07-31

**Identité par skin, jusqu'au favicon — DÉPLOYÉ (2026-07-31, agent-gw 0.40.1)** : le nœud
papillon du majordome s'affichait dans l'onglet du pod de code, et deux PWA installées sur le
même téléphone portaient le même nom. Favicon et manifeste sont réclamés par le navigateur
**avant tout JavaScript** — ils ne pouvaient donc pas venir du registre côté client. D'où un
pendant serveur : un skin dépose ses actifs sous `static/skins/<id>/` (`icon.svg`,
`manifest.json`), servis par les routes `/icon.svg` et `/manifest.webmanifest` — chemin stable
dans `app.html`, contenu qui dépend de `GW_THEME`, repli sur le socle si le skin n'a rien
déposé. Le blason de l'en-tête, lui, reste côté skin (champ `crest`, en `currentColor`).
Icône Skippy en **SVG à la main** plutôt qu'en image générée : à 16 px une matricielle bave et
le sujet EST géométrique — réduite à ce qui survit (anneau ambre interrompu, cœur, quatre
graduations) au lieu des 72 de la maquette. Vérifié **depuis l'extérieur, sans session** :
`/icon.svg` 200 `image/svg+xml` 1930 o portant bien `aria-label="Skippy"` + `#F2A93B`,
manifeste 200 au nom de Skippy, `/` toujours 307 (la garde n'a pas bougé), et l'icône d'Alfred
intacte. 11 tests de plus.

> 🔎 **Gotcha — sortir un actif de `/static/` le fait retomber derrière le SSO.** `_PUBLIC_PATHS`
> liste `/static/`, pas les routes racine. En 0.40.0 le favicon répondait donc **307 vers le
> login** : page de connexion sans icône, et installateur de PWA — qui fetche l'icône du
> manifeste sans forcément joindre le cookie — bredouille. Corrigé en 0.40.1 (+ test qui pinne
> les chemins publics). ⚠️ **Ne se voit PAS depuis le pod** : en interne le middleware laisse
> passer et on lit un 200 trompeur. Tout actif public se vérifie **en externe et déconnecté**.

**Habillage déclaratif des domaines — livré côté code (agent-gw, non taguée)** : l'icône et la
couleur d'un domaine étaient une ligne d'`APP_META` dans `main.js`. Un domaine neuf (`sante`)
sortait donc en `◆` + couleur hachée jusqu'au prochain déploiement — et Alfred, qui *crée* les
domaines, devait mendier une ligne de code pour chacun. Désormais un domaine **se décrit
lui-même** dans le frontmatter de son `INDEX.md` : `titre` / `ico` / `couleur`, lus par
`metaFor` depuis `/api/memory/index` (déjà chargé, **zéro route nouvelle**, backend intact).
Précédence **champ par champ**, `APP_META` conservé en repli → aucun domaine existant ne bouge
tant qu'Alfred ne l'a pas migré. `couleur` est un **vocabulaire fermé de 12 teintes** (`rouge`
… `ardoise`) mappées sur les jetons existants, jamais un hexa : la palette est thémée
clair/sombre **et** repeinte en bloc par les skins `data-agent` (un hexa figé ignorerait les
trois), et surtout la valeur finit dans un attribut `style` — un nom hors liste est **ignoré**,
ce qui ferme l'injection depuis un contenu mémoire d'origine douteuse (D17). `ico` est échappé
(les glyphes SVG restent aux modules). L'accueil attend maintenant l'index avant de peindre
(sinon les tuiles changeraient de livrée sous le doigt) ; il part en parallèle au boot, coût
nul. Contrat documenté dans `frontend/AUTHORING.md`, 9 tests (`test/habillage_test.py`) qui
pinnent le chemin de données — s'il cassait, la panne serait **muette** (repli silencieux).
**À faire : la moitié cerveau** (repo Alfred, skill `amelioration` + décision consignée) —
étendre le contrat `redaction` et poser le frontmatter dans chaque `domaines/*/INDEX.md` ;
tant qu'elle manque, l'attribut existe mais personne ne l'écrit. Puis tag → image →
déploiement.

> ☠️ **`agent-gw-v0.38.0` EST EMPOISONNÉE — NE JAMAIS LA DÉPLOYER.** Le tag pointe sur
> `8e93c18`, c'est-à-dire la régression décrite ci-dessous *avant* son correctif : l'image a
> bien été construite et publiée sur GHCR, et elle sert une PWA morte au premier rendu.
> Correction : **0.39.0** (`f741766`), qui embarque la restauration ET l'habillage déclaratif.
> Vérifié à HEAD avant tag — sonde de mangling à 0 sur les 15 noms emportés, témoin compris,
> et les 5 suites au vert. (La note « jamais partie en image » ci-dessous était fausse : le
> tag avait été posé avant que la régression soit connue.)

**Régression rattrapée (2026-07-31, non taguée — jamais partie en image)** : l'extraction du
registre de skins (`8e93c18`) a remplacé un bloc contigu de `main.js` au lieu d'y insérer le
sien, emportant **toute la couche mémoire du lanceur** (`memInfo`/`memIndex`, `loadTree`,
`loadIndex`, `domains`, `countIn`, `isFiche`, `prettify`, `memPrefix`, `childrenOf`,
`ficheCount`, `todoStats`, l'overlay todo, `loadWorkbooks`, `labelMemLinks`, `currentRoute`).
La PWA était **morte au premier rendu** (`ReferenceError: domains is not defined`). Bloc
restauré verbatim depuis `HEAD~1`, bundle + statics refaits.

> 🔎 **Gotcha — ni `node --check` ni `esbuild --bundle` ne voient ce genre de trou.** Un
> identifiant supprimé devient une **variable libre**, syntaxiquement valable et parfaitement
> bundlable : les deux passent au vert sur un lanceur mort. Le test qui, lui, le voit —
> **les noms de haut niveau définis sont manglés par `--minify`, les libres ne le sont pas** :
> ```
> npx esbuild src/launcher/main.js --bundle --format=iife --minify --outfile=/tmp/probe.js
> grep -c "prettify" /tmp/probe.js   # 0 = défini · >0 = variable libre, donc cassé
> ```
> Contrôle indispensable : vérifier qu'un nom **connu défini** (`renderHome`) rend bien 0,
> sinon c'est le mangling qui ne s'applique pas et le test ne prouve rien.

**Pod Skippy NÉ + charte propre — DÉPLOYÉ (2026-07-31, agent-gw 0.37.0)** : second corps sur
les mêmes images, `skippy.berard.me`, 2/2 Running. Trois variables d'env nouvelles, toutes
par-pod et toutes à défaut **inerte** (Alfred ne bouge pas d'un pixel) :
`GW_APPS` (modules du lanceur, 0.35.0), `GW_THEME` (0.36.0) et `GW_TRACE` (0.37.0).
- **`GW_THEME`** : les jetons de couleur/rayon/fonte étaient codés en dur sur `:root`, donc
  partagés — le pod Skippy s'affichait en livrée de majordome. `theme-skippy.css` est une
  **surcharge de jetons scopée** par `data-agent` (posé au boot depuis `/api/version`,
  AVANT le premier rendu), importée après `launcher.css`. Aucune règle existante réécrite.
  Couvre aussi `.alfred-doc` (sinon les fiches restaient en teal). Le bouton clair/sombre
  continue de marcher : les variantes `[data-agent][data-theme]` (0,3,0) battent les
  `:root[data-theme]` d'Alfred (0,2,0).
- **`GW_TRACE`** : le flux SSE ne portait que `text`/`done`/`error`. Les `ToolUseBlock` du
  SDK sortent désormais en events `tool` — **nom + cible courte uniquement** (champ parlant
  de l'input, replié, 78 car. max) : jamais l'input complet, qui porte le fichier entier
  d'un Write ou une commande Bash potentiellement chargée. Live seulement, `/api/history`
  ne rejoue pas la trace. Off par défaut.
- Le **noyau** (canvas, indicateur de travail) remplace les trois points sous le thème
  skippy ; boucle coupée par `prefers-reduced-motion` **et** par le retrait du nœud.
15 tests (`test/apps_test.py`), moteur et planif verts, bundle + statics rebuildés.
Vérifié en prod : image `0.37.0` sur le pod, `GW_THEME=skippy GW_TRACE=1 GW_APPS=repos` dans
l'env, 12 occurrences de `data-agent` dans le `launcher.css` **servi**, `/api/health` OK,
307 vers `/auth/login` en externe avec certificat valide.
⚠️ **0.36.0 est publiée mais n'a jamais vu de cluster** (superseded par 0.37.0) — ne pas la
déployer. **Reste à valider au doigt sur l'écran : le rendu réel de la charte.**

> 🔎 **Gotcha — un `hostPath` neuf naît `root:root`.** Le pod démarrait 1/2 : la gateway
> allait très bien (elle n'écrit rien au boot) pendant que le sidecar tunnel bouclait sur
> `could not lock config file /home/agent/.gitconfig: Permission denied`. `fsGroup` ne
> corrige pas ce cas (ne s'applique pas aux hostPath). Diagnostic en une commande : comparer
> `ls -ldn <mountPath>` avec une app qui marche (`1000 1000` vs `0 0`). Fix sans SSH : un pod
> jetable busybox en `runAsUser: 0` monté sur `/mnt/data`. Détail dans `k8s-config.md` (repo
> skippy). Les apps existantes ont été chownées à leur naissance — le piège ne se manifeste
> que sur une app NEUVE.

**Modules configurables `GW_APPS` — livré côté code (agent-gw, non taguée)** : les images
se disent agent-agnostiques depuis le début, le **lanceur** ne l'était pas — routes et
tuiles `todo` / `projets` / `atelier` / `planif` / `voyages` câblées en dur sur le monde
d'Alfred. Un second corps (pod Skippy, cf. `SKIPPY-POD.md`) y aurait affiché des tuiles de
menuiserie. Désormais `GW_APPS` liste les modules du pod, `/api/version` les publie, le
lanceur les lit **au boot** (avant le premier rendu, sinon on voit passer les tuiles du
repli) et masque **la tuile ET la route** — une URL en marque-page ne ressuscite pas un
module éteint. La mémoire (fiches, domaines) n'est pas un module : socle commun, toujours
là. Effets de bord voulus : module Voyages éteint → `#/dom/voyages` redevient un domaine
ordinaire ; module Atelier éteint → `diy` réapparaît dans les domaines au lieu de
disparaître ; rangée « Transverse » masquée si vide ; les enrichissements de tuiles
(todoStats, `/api/planif`, voyages) ne partent plus en réseau pour des tuiles absentes.
Défaut = jeu historique, **Alfred ne bouge pas**. Tests `test/apps_test.py` (défaut, liste
explicite, rognage, vide, payload `/api/version`), planif toujours vert, bundle + statics
rebuildés. **À faire : tag → image → déploiement.**

**Tâches planifiées — DÉPLOYÉ (2026-07-29, agent-gw 0.34.1)** : Alfred n'avait aucun
déclencheur temporel ; la consolidation des gestes (todo/voyage), le push mémoire du soir
et la « une » du matin attendaient qu'on lui ouvre une session. Nouveau module
`app/planif.py` : une boucle asyncio lit `memory/planif/*.md` (fiches `type: planif`, en
git, écrites par Alfred seul) et ouvre à l'heure dite un tour ordinaire avec **le corps de
la fiche pour prompt** — session neuve, `_query_lock` partagé, journal dans
`planif/planif-state.json` (hors git). Cron maison 5 champs : on **matche la minute locale**
au lieu de calculer une prochaine échéance en UTC — DST correct sans arithmétique de fuseau,
et « pas de rattrapage » vient gratuitement (fenêtre de grâce 5 min, une occurrence, jamais
la file). Plancher de fréquence 15 min : un cron plus fin rend la fiche **invalide** au lieu
d'être lissé en silence. Garde : `GW_CHANNEL=planif` injecté via `ClaudeAgentOptions.env`
(vérifié sur le pod : le SDK **fusionne** ce dict sur l'env hérité, le token OAuth survit) →
`google_guard.py` ferme **toute** la surface Google sur ce canal, lectures comprises — pas
seulement à cause du bouclier inarmable, mais contre le **blanchiment** (mail hostile lu sans
témoin → résumé dans memory/ → relu comme fiable au tour suivant). Onglet PWA `#/planif` en
**lecture** (créer/suspendre = message à Alfred). Le prompt porte un **cadre de provenance**
(patron `ask_alfred`) : sans lui l'agent ne peut pas *savoir* qu'il est dans un tour planifié
— la discipline lui dit comment s'y comporter, pas qu'il y est ; le corps de la fiche passe
mot pour mot en dessous. Cerveau : **D30** + **F8** (repo Alfred), qui amende la seule ligne
« aucun déclencheur temporel » de D8 — le contrat « Alfred n'écrit jamais de lui-même »
tient : palier 1 = tâches **muettes**. 47 tests verts (`test/planif_test.py`), hook testé sur
les 3 canaux, `node --check` + bundle + statics OK. ⚠️ **0.34.0 est publiée mais périmée**
(taguée avant le cadre de provenance) : déployer **0.34.1**, jamais 0.34.0.
Déploiement : tag `agent-gw-v0.34.1` → image GHCR multi-arch vérifiée au manifest registry →
`alfred-helm.yml` 0.33.2 → 0.34.1 → refresh ArgoCD forcé → pod 3/3 Running en 0.34.1,
`/api/planif` présent dans `app.openapi()`. **E2E prouvé en prod** : fiche temporaire calée à
`00:11`, tour parti à `00:11:08` (tick de 30 s), 3,7 s, réponse conforme, journal écrit —
fiche et entrée de journal retirées derrière. Garde rejouée **sur le pod** : canal `planif` →
`exit 2` sur `mail_search` / `calendar_events` / `mail_draft` / `calendar_create` ; canal
`pwa` inchangé (lectures et brouillon passent, `calendar_update` réclame le bouclier).

> 🔎 **Gotcha de déploiement — le hook ne voyage PAS dans l'image.** `google_guard.py` vit
> dans le **workspace** (repo Alfred, monté sur le PVC), pas dans `agent-gw`. Au moment du
> déploiement, le pod était encore sur un commit antérieur : l'image portait le canal
> `planif`, **le coupe-circuit n'était pas là**. Une fenêtre où des tours planifiés
> auraient pu atteindre Google. → **Livrer une garde = deux gestes** : publier l'image ET
> `memory-sync pull` dans le pod. Vérifier avec un `grep` sur le fichier réel du workspace,
> jamais en supposant que « c'est poussé sur origin donc c'est actif ».

> 🔎 **Gotcha de vérification — « la route est-elle servie ? » ne se prouve PAS par un 401.**
> Le middleware d'auth d'agent-gw s'exécute **avant** le routage : `/api/nexistepas` répond
> `401` exactement comme `/api/planif` (mesuré sur le pod, 2026-07-29). Le test utilisé pour
> 0.33.0 était donc un faux positif. Ne marche pas non plus : parcourir `app.routes` — les
> routeurs montés par `include_router` y apparaissent en `_IncludedRouter` sans `.path`, si
> bien que `/api/voyage/*` semble absent alors qu'il tourne. **Le seul test concluant depuis
> le pod :**
> `python -c "from app.main import app; print(sorted(app.openapi()['paths']))"`.

**⚠️ Fausse piste à ne PAS refaire — approbation MCP (2026-07-28).** Une indispo du serveur
**ghost** s'était déguisée en problème d'approbation des serveurs MCP, d'où une piste
`claude-flag-settings.json` (`enableAllProjectMcpServers: true` copié dans l'image et passé
au SDK par `--settings`). **Inutile** : root cause trouvée ailleurs, et mesuré sur le pod en
0.33.0 — `hasTrustDialogAccepted: false` et `enabledMcpjsonServers: []` dans `~/.claude.json`,
et pourtant Alfred appelle bel et bien `mcp__google__*` / `mcp__transit__*`. Les MCP du
`/workspace/.mcp.json` chargent **sans** trust ni pré-approbation. Piste abandonnée, fichier
et hunk Dockerfile supprimés. → Si les outils MCP disparaissent un jour, suspecter le serveur
en amont, pas l'approbation.

**Cocher une tâche = un geste — DÉPLOYÉ (2026-07-28, agent-gw 0.33.0)** : la case de la
vue todo ne cochait rien, elle **pré-remplissait la zone de saisie** (« Marque la tâche
« … » comme faite. ») qu'il fallait envoyer soi-même — un aller-retour LLM pour un booléen.
Désormais `GET|POST /api/todo/state` écrit un overlay `todo/todo-state.json` (hors git,
comme workbook/voyage), le front le superpose à `/api/memory/index` (l'overlay gagne) et le
clic est **optimiste** : bascule immédiate, POST direct, révocation si le réseau tombe.
Décochage géré (l'overlay porte 3 états : date ISO / `false` / absent, la fiche pouvant
déjà dire `done:` depuis une consolidation). Alfred consolide le `done:` dans les fiches à
son passage suivant, **en gardant la date du geste**. Retirer d'une liste / supprimer une
liste restent des messages à Alfred (curation = jugement). Cerveau : **D28** (repo Alfred),
qui renverse partiellement D27. Endpoint testé (TestClient : coche, décoche, merge,
persistance, 400 sans clé) ; bundle + statics rebuildés, tests moteur verts, `node --check`
OK. Tag `agent-gw-v0.33.0` → image GHCR multi-arch (amd64+arm64) vérifiée au manifest
registry → `alfred-helm.yml` bumpé 0.32.0 → 0.33.0 → refresh ArgoCD forcé → pod alfred
3/3 Running, image `agent-gw:0.33.0` confirmée, `/api/todo/state` répond **401** (~~route
servie et gardée — un 404 aurait signé une image sans le code~~ ⚠️ **raisonnement FAUX**,
cf. l'entrée planif : le middleware d'auth passe AVANT le routage, une route inexistante
répond 401 elle aussi). **Reste à valider au doigt sur l'écran : la bascule optimiste dans
un vrai navigateur.**

⚠️ Les entrées « non taguée » plus bas (UI mobile, pièces jointes) sont **périmées** :
elles ont été taguées et déployées depuis (0.30.0 → 0.32.0) sans que ce fichier soit
repassé dessus. À nettoyer au prochain passage.

**File d'attente — rattrapage groupé — DÉPLOYÉ (2026-07-23, agent-gw 0.29.0)** : les
messages tapés pendant qu'Alfred travaille étaient rejoués **un par un** (un tour par
message) ; désormais ils sont **fusionnés en un seul tour** au prochain passage — textes
recollés en paragraphes (ordre préservé), pièces jointes concaténées. Modif client-only, un
point : sortie de file dans `sendMessage` (`queue.shift` → `queue.splice(0)` + merge),
`frontend/src/launcher/main.js`. Tag `agent-gw-v0.29.0` → image GHCR multi-arch OK →
`alfred-helm.yml` bumpé 0.28.0 → 0.29.0 → pod alfred 3/3 Running vérifié.

**UI mobile — 3 retouches livrées côté code (agent-gw, non taguée)** :
1. **Composer replié** : les 3 actions (🛡 ⚡ 📎) passent sous un « + » en mobile
   (popover `.moretray` ; desktop inchangé via `display:contents`), pastille sur le
   « + » quand bouclier ou éphémère est armé. Fichiers : `app.html`, `launcher.css`,
   `launcher/main.js` (bloc Feature 1).
2. **Zoom bridé** : viewport `maximum-scale=1, user-scalable=no` (honoré par iOS en
   PWA standalone) + `touch-action:manipulation` (coupe le double-tap-zoom) + textarea
   `16px` en mobile (coupe le zoom au focus iOS). La coque était déjà verrouillée
   (100dvh, seule `.stream` scrolle) → « je perds header/barre » venait du zoom de
   page, pas du layout.
3. **Swipe deux-écrans** : `#shell` devient une piste 200vw ; swipe horizontal (suivi
   du doigt + calage à 28 %) bascule chat ⇆ apps, poignées de bord (`.edge`) en
   affordance/repli. Mobile seul (`max-width:820px`, aligné JS/CSS) ; desktop garde le
   rail redimensionnable. **Chat = écran par défaut** (route vide ramène au chat ;
   naviguer vers une app ouvre l'écran apps) ; le swipe/les poignées basculent en plus.
   Bundle + statics rebuildés (esbuild), tests moteur verts, `node --check` OK.
   **À faire : tag → image → bump manifeste k8s pour déployer + test sur téléphone.**

**État :** **vue Todo réécrite côté code (agent-gw, non taguée)** :
`renderTodo`/`todoStats`/`renderList` consomment `/api/memory/index` — fini le parseur de cases
à cocher de `taches.md` (qui avait vidé l'écran après la migration des todos au format fiche).
Base unique `type: tache`, **listes curées `type: liste` (refs)** + vues dynamiques calculées
(retard / rapides / bloquées / base), sous-tâches `sub:`, non-duplication rendue visible
(pastilles « dans quelles listes »). Gestes (cocher, retirer, créer/supprimer une liste) =
messages à Alfred, **jamais d'écriture** (frontière workbook/voyages). Contrat `type: liste`
côté cerveau (**D27**, repo Alfred). Bundle + statics à jour, tests moteur verts, modèle vérifié
sur données réelles. **À faire : tag → image → déploiement** (embarque aussi les pièces jointes
ci-dessous).

**État (pièces jointes) :** **livrées côté code (agent-gw, non taguée)** : bouton 📎
(+ appareil photo) + glisser-déposer + coller ; `POST /api/upload` pose les fichiers dans
`GW_STATE_DIR/inbox/` (hors repo mémoire, purge TTL), `/api/chat` les résout (garde
anti-traversée) et préfixe le prompt d'une note anti-injection (D17) — Alfred les lit via
son outil `Read`. Front rebuildé (bundle + statics à jour). **À faire : tag `agent-gw-v0.21.0`
→ image → bump du manifeste k8s.** Voir plus bas.

**Fix buffer image jointe — DÉPLOYÉ (2026-07-21, agent-gw 0.22.1)** : lire une vraie
photo via `Read` faisait « JSON message exceeded maximum buffer size of 1048576 bytes » —
le SDK inline l'image en base64 dans UN message stream-json, et son buffer stdout par
défaut est 1 Mo. `ClaudeAgentOptions(max_buffer_size=…)` posé sur les **deux** appels
`query`, dimensionné sur `MAX_UPLOAD_BYTES × 2` (override `GW_MAX_BUFFER_MB`) ; plancher
SDK relevé à `>=0.2.124` (version où le champ est vérifié). Tag `agent-gw-v0.22.1` →
image GHCR OK → `alfred-helm.yml` bumpé 0.22.0 → 0.22.1 → pod alfred 3/3 Running vérifié.

**État (précédent) :** **rosetta-bridge livré dans les deux images** (claude-pod 0.4.0, agent-gw
0.20.0) : relais stdio→HTTP vers le hub `rosetta.mcp.berard.me` (repo rosetta-mcp, EN
PROD sur tantive — maps + transit, clés d'API côté serveur), refresh de token
client_credentials (`agent-alfred`) intégré, stdlib seule — testé e2e en conteneur
Linux contre la prod. Les `mcp_servers/` d'agent-gw sont DEPRECATED (retrait + purge
des clés de l'env après bascule vérifiée). ⚠️ Le pod tourne en agent-gw 0.18.0 :
0.19.0 (économie de contexte : TTL session, pastille poids, menu Sujets, mode
éphémère ⚡, Réglages ⚙) est taguée mais jamais déployée → déployer 0.20.0 l'embarque.
Avant : alfred-voice 0.1.0 déployé ; module Voyages livré (spec `VOYAGES.md`).

**Bascule rosetta FAITE (2026-07-20)** : pod alfred en agent-gw 0.20.0 + claude-pod
0.4.0, identité `agent-alfred` via coffre (`oidc/agent-alfred`, externalSecrets
data + groups.tunnel), `.mcp.json` → rosetta-bridge (repo + /workspace du pod),
bridge vérifié in situ dans le conteneur tunnel (initialize → serverInfo maps).

**DÉPLOYÉ (2026-07-20)** : Authelia client alfred enrichi (offline_access,
audience rosetta, RS256, consent implicit), pod alfred en 0.21.0/0.5.0,
`.mcp.json` google → rosetta-bridge (repo + pod). E2E EN ATTENTE : re-login PWA
(semer le refresh token) puis test Gmail — si « aucun compte enrôlé pour
<uuid> » : ajouter une claims_policy Authelia (preferred_username dans
l'access token). Avenant skill correspondance = côté cerveau.

**Prochaines étapes :**
- [ ] **Pod Skippy** (`SKIPPY-POD.md`) — design validé, `GW_APPS` posé, question CI
      tranchée (un token d'App déclenche bien les workflows → `actions_run` retiré de
      la surface). Prochain geste, **côté navigateur** : créer la GitHub App. Puis
      addon `github` dans rosetta-mcp, `github_guard.py`, vue `repos`, repo cockpit,
      `skippy-helm.yml`.
- [ ] **Tâches planifiées** : reste à voir de ses yeux l'onglet `#/planif` dans un vrai
      navigateur (vide aujourd'hui — Alfred n'a pas encore posé de fiche). La première sera
      la consolidation de `todo-state.json`.
- [ ] **UI mobile (3 retouches)** : taguer une nouvelle `agent-gw-vX.Y.Z` → image CI →
      bumper `image.tag` dans `alfred-helm.yml` (k8s-home-lab) → ArgoCD. Tester sur
      téléphone : le « + » (+ pastille), l'absence de zoom involontaire, le swipe chat⇆apps.
- [ ] **Pièces jointes** : taguer `agent-gw-v0.21.0` (CI build l'image) puis bumper `image.tag`
      dans `alfred-helm.yml` (k8s-home-lab) → ArgoCD déploie. Tester en prod : 📎 sur mobile,
      drop + coller sur desktop, un envoi fichiers-seuls, un PDF lu par Alfred.
- [ ] Après quelques jours de bascule sans accroc : agent-gw 0.22.0 sans `mcp_servers/`, retirer
      GOOGLE_MAPS/SNCF/IDFM de `externalSecrets.data` d'alfred-helm.yml
- [ ] **Rosetta / Google** : scoper le MCP Google en SOUS-AGENT `correspondance`
      (`AgentDefinition.mcpServers`) pour sortir ~6-9k du socle des tours ordinaires —
      CONDITIONNÉ à la vérif que le hook `google_guard` et le bouclier 🛡 se
      déclenchent bien dans un sous-agent (D17/D24). Cf. DECISIONS.md (repo Alfred).
- [ ] agent-gw : proxy `/api/voice/*` → alfred-voice + page Réglages → Vocal (devices,
      services Wyoming, voix par route avec préécoute)
- [ ] Test d'intégration sur un Voice PE (désactiver son entité `assist_satellite`
      dans HA d'abord) ; ajuster VAD/timeouts ; voix « alfred » à ajouter dans
      nestor-voice
- [ ] Côté cerveau (repo Alfred) : décision **D31** (canal vocal) + registre vocal.
      ⚠️ Le numéro a glissé deux fois le 2026-07-28 : D28 = overlay des gestes todo,
      D29 = brouillon corrigeable / allowlist rosetta, D30 = tâches planifiées. Le vocal
      prendra le prochain numéro libre — vérifier `DECISIONS.md` avant d'écrire, pas ce
      fichier.
