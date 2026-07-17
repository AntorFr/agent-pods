# Status — agent-pods

> MàJ : 2026-07-18

**État :** Gateway + PWA Alfred en refonte (cahier des charges : `images/agent-gw/REDESIGN.md`).
Spec v1 du planificateur de voyages posée (`images/agent-gw/VOYAGES.md`) — validée en session.
Mockup fait (2026-07-18) dans l'artifact « Alfred — App » : tuile + domaine Voyages, timeline
par jour (météo J+10, bandeaux hébergement, liaisons dérivées), tray drag & drop. À faire
valider, puis figer `voyage.json` et implémenter.

**Prochaines étapes :**
- [x] Mockup timeline Voyages (tray + drag & drop) dans l'artifact « Alfred — App »
- [ ] Implémenter le module voyage : `type: voyage` (moteur + AUTHORING), timeline + API d'état, endpoints météo/routes
- [ ] Côté cerveau (repo Alfred) : skill `voyages` + entrée DECISIONS.md
