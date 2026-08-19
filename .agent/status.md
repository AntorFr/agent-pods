# Status — agent-pods
> MàJ : 2026-08-20

**État :** Trois images en production, **déployées** — `agent-gw` 0.77.0 sur les trois
corps (Alfred, Skippy, Nestor), `claude-pod` 0.6.0, `agent-voice` 0.2.0. L'identité vient
du `/workspace` monté, jamais de l'image, et c'est maintenant vrai jusque dans les noms.

Deux chantiers livrés coup sur coup :

- **L'arbre des plugins.** Un plugin porte tout ce qu'il apporte (contrat, API,
  exécutables, câblage) et déclare sa **sorte** — `socle` (toujours), `app` (`GW_APPS`),
  `outil` (`GW_TOOLS`) ; le corps n'en connaît plus aucun par son nom. `git` est le
  premier `outil` : publier n'est pas un écran, et tous les corps n'y ont pas droit.
- **Le dé-marquage.** Plus aucun déploiement privé en dur dans une image publique :
  `alfred-voice` → `agent-voice`, `rosetta-bridge` → `mcp-bridge`,
  `git-credential-rosetta` → `git-credential-hub`, `ROSETTA_*` → `HUB_*`. Surtout, les
  **défauts** qui pointaient `berard.me` / `intra.sberard.fr` ont disparu : absents, le
  code refuse franchement. Les manifestes déclarent ces valeurs — dans cet ordre, jamais
  l'inverse. `bin_test` tient la garde pour que la faute ne revienne pas.

**Dettes de transition — toutes bloquées sur le MÊME verrou** (2026-08-20). Les
manifestes sont passés en `HUB_URL` / `HUB_TOKEN_URL`, et le clone d'Alfred lance bien
`mcp-bridge`. Ne restent que des replis, et ils tombent **ensemble**, en une seule
livraison, le jour où le clone déployé du **cockpit** aura rattrapé :

- l'alias `rosetta-bridge` → `mcp-bridge` sur le PATH des deux images ;
- l'injection du jeton de session sous les deux noms (`_run_alfred`) — le `.mcp.json`
  déployé du cockpit interpole encore `${ROSETTA_USER_TOKEN}` dans ses en-têtes ;
- la lecture des `ROSETTA_*` dans `mcp-bridge`, `trace-geom` et `git-credential-hub` ;
- le repli `ALFRED_VOICE_*` dans agent-voice — celui-là est déjà mort (plus personne ne
  pose ces variables), il attend juste de partir avec les autres plutôt que de coûter
  un cycle de déploiement pour lui seul.

⚠️ **Le verrou n'est pas technique, il est chez Skippy-pod** : son clone du cockpit porte
**44 commits non publiés**, qui attendent un bouclier (il le sait, c'est écrit dans son
propre status). Un `memory-sync pull` tenté depuis le Mac le 2026-08-20 a été **abandonné
volontairement** — 13 conflits sur 43 commits, dans du travail dont je n'ai pas le
contexte. Ce n'est pas à faire de l'extérieur : c'est une session avec Monsieur, bouclier
armé. Le pod est resté intact.

Quand il publiera, un conflit trivial l'attend sur `.mcp.json` (j'ai poussé le passage à
`mcp-bridge` sur `origin`). La résolution est déjà arbitrée, sur mesure et non sur
mémoire : garder SON bloc `unifi` (`unifi-agent.mcp.berard.me` en Basic — vérifié le
2026-08-20, l'hôte résout et un `initialize` MCP répond **200**, contrairement à ce
qu'affirmait une note d'`origin` datée du 11/08), garder le `ha` d'`origin`, et adopter
`mcp-bridge`.

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
