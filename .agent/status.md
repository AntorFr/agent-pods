# Status — agent-pods
> MàJ : 2026-08-19

**État :** Trois images en production (`agent-gw`, `claude-pod`, `alfred-voice`), trois
corps servis par la même `agent-gw` — Alfred, Skippy, Nestor — l'identité venant du
`/workspace` monté, jamais de l'image. **`agent-gw` 0.76.0 déployée sur les trois**
(2026-08-19). Dernier chantier livré : **l'arbre des plugins**. Un plugin porte désormais
tout ce qu'il apporte (contrat, API, exécutables, câblage) et déclare sa **sorte** —
`socle` (toujours), `app` (`GW_APPS`), `outil` (`GW_TOOLS`) ; le corps n'en connaît plus
aucun par son nom. `git` est le premier `outil` : publier n'est pas un écran, et tous les
corps n'y ont pas droit.

**Prochaines étapes :**
- [ ] **Un job de test dans la CI, avant le build.** Aujourd'hui `docker-publish.yml`
      CONSTRUIT les images sans jamais rien exécuter — pas un test, pas même un import.
      Ce n'est pas théorique : le 2026-08-19, retirer `workspace-mcp` a libéré la
      contrainte transitive qui plafonnait `mcp` en 1.x, `mcp>=1.2` a résolu en 2.0.0 —
      qui supprime `mcp.server.fastmcp` — et la gateway ne démarrait plus **du tout**.
      Rattrapé à la main en construisant l'image pour vérifier autre chose ; rien dans la
      chaîne ne l'aurait arrêté. Deux gardes suffiraient, et elles sont bon marché :
      `python test/*.py` + `npm test` en `needs:` du job build (le patron commenté est
      déjà dans le workflow), et surtout **un `python -c "import app.main"` dans l'image
      construite** — c'est lui qui aurait vu celle-ci, les bancs tournant sur un venv
      dont la résolution est figée depuis longtemps.
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
> (`plugins/*/`, `REDESIGN.md`) — chaque archive vit désormais à côté du plugin
> qu'elle décrit.
