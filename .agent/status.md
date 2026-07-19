# Status — agent-pods

> MàJ : 2026-07-19

**État :** Nouvelle image **alfred-voice** (v1 codée, non taguée) : serveur vocal qui
pilote les satellites ESPHome `voice_assistant` via l'API native (à la place de HA),
STT/TTS Wyoming (whisper + nestor-voice), routage par wake word → Alfred (MCP
`ask_alfred`, ack + annonce différée) ou HA (conversation, mode sync). Config JSON à
chaud (écrite par la future page Réglages de la PWA), API de contrôle 8100
(status/test/say/tts). Par ailleurs : gateway + PWA en refonte (`REDESIGN.md`),
module Voyages livré côté corps (spec `VOYAGES.md`).

**Prochaines étapes :**
- [ ] Tag `alfred-voice-v0.1.0` → image GHCR, puis conteneur dans le pod alfred
      (values `alfred-helm.yml` : additionalContainer + port 8100 + ingress /tts +
      secrets coffre `home/esphome` & `home/home-assistant`)
- [ ] agent-gw : proxy `/api/voice/*` → alfred-voice + page Réglages → Vocal (devices,
      services Wyoming, voix par route avec préécoute)
- [ ] Test d'intégration sur un Voice PE (désactiver son entité `assist_satellite`
      dans HA d'abord) ; ajuster VAD/timeouts ; voix « alfred » à ajouter dans
      nestor-voice
- [ ] Côté cerveau (repo Alfred) : décision D27 (canal vocal — D26 est pris par les voyages) + registre vocal
- [ ] Déployer agent-gw refondu (voyages) + créer le premier vrai dossier voyage
