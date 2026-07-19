# Status — agent-pods

> MàJ : 2026-07-19

**État :** **alfred-voice 0.1.0 déployé** (2026-07-19) : release taguée → GHCR,
conteneur `voice` dans le pod alfred (port 8100, ingress /tts, secrets coffre
`home/esphome` + `home/home-assistant` via external-secrets). 1er déploiement reverté
(secret `home/esphome` absent du coffre → ExternalSecret atomique → synchro
`alfred-secrets` cassée) ; re-posé après création du secret (geste admin). Serveur
vocal : satellites ESPHome `voice_assistant` en API native, STT/TTS Wyoming, routage
par wake word → Alfred (MCP `ask_alfred`) ou HA. Config JSON à chaud (future page
Réglages), API de contrôle 8100. Par ailleurs : gateway + PWA en refonte
(`REDESIGN.md`), module Voyages livré côté corps (spec `VOYAGES.md`).

**Prochaines étapes :**
- [ ] agent-gw : proxy `/api/voice/*` → alfred-voice + page Réglages → Vocal (devices,
      services Wyoming, voix par route avec préécoute)
- [ ] Test d'intégration sur un Voice PE (désactiver son entité `assist_satellite`
      dans HA d'abord) ; ajuster VAD/timeouts ; voix « alfred » à ajouter dans
      nestor-voice
- [ ] Côté cerveau (repo Alfred) : décision D27 (canal vocal — D26 est pris par les voyages) + registre vocal
- [ ] Déployer agent-gw refondu (voyages) + créer le premier vrai dossier voyage
