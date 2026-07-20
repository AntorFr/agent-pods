# Status — agent-pods

> MàJ : 2026-07-20

**État :** **pièces jointes du chat livrées côté code (agent-gw, non taguée)** : bouton 📎
(+ appareil photo) + glisser-déposer + coller ; `POST /api/upload` pose les fichiers dans
`GW_STATE_DIR/inbox/` (hors repo mémoire, purge TTL), `/api/chat` les résout (garde
anti-traversée) et préfixe le prompt d'une note anti-injection (D17) — Alfred les lit via
son outil `Read`. Front rebuildé (bundle + statics à jour). **À faire : tag `agent-gw-v0.21.0`
→ image → bump du manifeste k8s.** Voir plus bas.

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
- [ ] Côté cerveau (repo Alfred) : décision D27 (canal vocal — D26 est pris par les voyages) + registre vocal
