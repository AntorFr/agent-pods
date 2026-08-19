# Status — agent-pods
> MàJ : 2026-08-19

**État :** Trois images en production (`agent-gw`, `claude-pod`, `alfred-voice`), quatre
corps servis par la même `agent-gw` — Alfred, Skippy, Nestor — l'identité venant du
`/workspace` monté, jamais de l'image. Dernier chantier livré : **l'arbre des plugins**.
Un plugin porte désormais tout ce qu'il apporte (contrat, API, exécutables, câblage) et
déclare sa **sorte** — `socle` (toujours), `app` (`GW_APPS`), `outil` (`GW_TOOLS`) ; le
corps n'en connaît plus aucun par son nom. `git` est le premier `outil` : publier n'est
pas un écran, et tous les corps n'y ont pas droit.

**Prochaines étapes :**
- [ ] Taguer `agent-gw-v0.76.0` et bumper les manifestes des **trois** pods (alfred,
      skippy, nestor épinglent la même image — en bumper un seul laisse les autres en
      arrière, sans aucun symptôme).
- [ ] `GW_TOOLS: "git"` sur `skippy-helm.yml` : sans lui le corps de code perd le
      câblage du helper, donc la capacité de publier.
- [ ] Un push sur `main` **depuis le pod** — le dernier chemin du proxy git non éprouvé
      (les branches neuves, elles, passent depuis le 2026-08-10).
- [ ] Supprimer `pod/git-0.15.0` sur `origin` : fusionnée, mais le proxy refuse les
      suppressions de ref → geste du Mac.
- [ ] **La frontière non franchie** : un plugin tiers peut livrer un contrat, une API et
      un exécutable, mais pas encore une **vue** — le front garde son registre
      (`frontend/src/launcher/apps/index.js`) et les modules historiques vivent toujours
      dans `launcher/main.js`. Décision tenue : on les déplace quand on y touche de toute
      façon, pas pour la symétrie.
- [ ] Côté cerveau (Alfred, pas ici) : réécrire les 17 jonctions d'`imp3d` sous
      `jonctions[]` et déclarer les `appui`.

> Ce fichier est une **synthèse**, pas un journal : l'historique détaillé de chaque
> chantier est dans `git log` (messages de commit longs, un par intention) et le
> « pourquoi » des choix dans les commentaires du code et les archives de conception
> (`ATELIER-3.md`, `VOYAGES.md`, `PARCOURS.md`, `REDESIGN.md`).
