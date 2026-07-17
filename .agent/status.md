# Status — agent-pods

> MàJ : 2026-07-18

**État :** Gateway + PWA Alfred en refonte (cahier des charges : `images/agent-gw/REDESIGN.md`).
Module Voyages **implémenté côté corps** (2026-07-18, spec `images/agent-gw/VOYAGES.md`) :
API `/api/voyage/*` (list, gestes → overlay `voyage-state.json`, météo/routes dérivées),
module launcher (hub + timeline + tray DnD + fiche), type `voyage` au contrat AUTHORING.
Vérifié sur gateway locale + fixture (gestes, refus, dégradation sans clé Google).

**Prochaines étapes :**
- [x] Mockup timeline Voyages (tray + drag & drop) dans l'artifact « Alfred — App »
- [x] Module voyage côté corps : API d'état, endpoints météo/routes, front launcher, AUTHORING
- [ ] Côté cerveau (repo Alfred) : skill `voyages` + entrée DECISIONS.md
- [ ] Déployer (rebuild image agent-gw) et créer le premier vrai dossier voyage
