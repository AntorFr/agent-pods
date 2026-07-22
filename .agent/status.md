# Status — agent-pods

> MàJ : 2026-07-23

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
- [ ] Côté cerveau (repo Alfred) : décision **D28** (canal vocal — D26 voyages, D27 pris par le modèle todo) + registre vocal
