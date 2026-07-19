# Status — agent-pods

> MàJ : 2026-07-19

**État :** **agent-gw 0.19.0 — économie de contexte** (2026-07-19) : le poids d'une
session est désormais borné et visible. TTL d'inactivité (`GW_SESSION_TTL`, 4 h) qui
ne reprend plus une session périmée ; `GET /api/session` renvoie le poids du contexte
en tokens (input+cache du dernier appel) → pastille indicative dans la PWA ; menu
Sujets (▤) qui consolide dans `memory/` puis repart sur session vierge en rechargeant
la fiche (« compaction UX »), avec bouton archiver 🗄 par sujet (délégué à l'agent) ;
mode éphémère ⚡ (tour hors conversation, ni resume ni sauvegarde) ; menu Réglages ⚙
(thème + tunnel VS Code). Avant : **alfred-voice 0.1.0 déployé**, conteneur `voice`
dans le pod (port 8100, ingress /tts, secrets coffre via external-secrets) ; module
Voyages livré (spec `VOYAGES.md`).

**Prochaines étapes :**
- [ ] **Rosetta** : quand les MCP passent en serveur externe, scoper le MCP Google en
      SOUS-AGENT `correspondance` (`AgentDefinition.mcpServers`) pour sortir ~6-9k du
      socle des tours ordinaires — CONDITIONNÉ à la vérif que le hook `google_guard`
      et le bouclier 🛡 se déclenchent bien dans un sous-agent (D17/D24). Cf. DECISIONS.md (repo Alfred).
- [ ] agent-gw : proxy `/api/voice/*` → alfred-voice + page Réglages → Vocal (devices,
      services Wyoming, voix par route avec préécoute)
- [ ] Test d'intégration sur un Voice PE (désactiver son entité `assist_satellite`
      dans HA d'abord) ; ajuster VAD/timeouts ; voix « alfred » à ajouter dans
      nestor-voice
- [ ] Côté cerveau (repo Alfred) : décision D27 (canal vocal — D26 est pris par les voyages) + registre vocal
