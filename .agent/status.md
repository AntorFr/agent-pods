# Status — agent-pods

> MàJ : 2026-07-19

**État :** **rosetta-bridge livré dans les deux images** (claude-pod 0.4.0, agent-gw
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

**Prochaines étapes :**
- [ ] Après quelques jours de bascule sans accroc : agent-gw 0.21.0 sans `mcp_servers/`, retirer
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
