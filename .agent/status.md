# Status — agent-pods
> MàJ : 2026-08-20

🗑️ **`memory-sync` est RETIRÉ du corps — À TAGUER (2026-08-20).** La mémoire d'Alfred a
quitté git le jour même : détrackée, posée en `.gitignore` et **expulsée de tout
l'historique** (`git filter-repo`, force-push — 749 commits → 126, `.git` de 108 Mo →
496 Ko). C'est l'exécution de D49 chez Alfred, elle-même issue du § 3 de son dossier de
refonte, tranché le 2026-08-02 : *« un dépôt → deux magasins »*, le cerveau reste
versionné, la mémoire vit sur le système de fichiers avec des snapshots ZFS pour filet.

L'outil encapsulait la boucle pull-rebase / commit / push d'une mémoire **multi-auteur**.
Ses deux raisons d'être sont tombées l'une après l'autre : la co-édition d'abord (la
machine de dev n'écrit plus dans la mémoire), puis git lui-même. Retiré plutôt que gardé
en no-op — un outil qui ne fait rien mais qu'on peut encore appeler est pire qu'absent.
Touchés : `bin/memory-sync` (supprimé), `Dockerfile`, `test/bin_test.py` (le banc vérifie
désormais son **absence**), `plugins/README.md`, `plugins/git/setup` (la leçon sur le
helper scopé reste, la référence à l'outil est datée). `python test/bin_test.py` → **BIN OK**.

> ⚠️ **Le déploiement ne peut PAS revenir en arrière sans casse.** Le CLAUDE.md d'Alfred ne
> mentionne plus l'outil et son `memory/` est ignoré : une image antérieure le rechercherait
> en vain. Et surtout, la ligne `memory/` du `.gitignore` d'Alfred ne se retire jamais —
> dans le pod, `/workspace/memory` est un point de montage NFS, et un `pull` sur
> l'historique réécrit **supprimerait la mémoire vivante du NAS**.

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
  **défauts** qui pointaient mon propre domaine ont disparu : absents, le
  code refuse franchement. Les manifestes déclarent ces valeurs — dans cet ordre, jamais
  l'inverse. `bin_test` tient la garde pour que la faute ne revienne pas.

**Dettes de transition — plus AUCUN consommateur, les replis sont morts** (2026-08-20).
Mesuré sur les trois pods, pas supposé : les manifestes posent `HUB_URL` /
`HUB_TOKEN_URL` et **aucun** ne porte plus une variable `ROSETTA_*` ; les `.mcp.json`
déployés d'Alfred et du cockpit lancent `mcp-bridge` et interpolent `${HUB_USER_TOKEN}` ;
Nestor n'a pas de `.mcp.json`. Ce qui reste est donc du **code mort**, pas une béquille :

- l'alias `rosetta-bridge` → `mcp-bridge` sur le PATH des deux images ;
- l'injection du jeton de session sous les deux noms (`_run_alfred`) ;
- la lecture des `ROSETTA_*` dans `mcp-bridge`, `trace-geom` et `git-credential-hub` ;
- le repli `ALFRED_VOICE_*` et la valeur de backend `"alfred"` dans agent-voice.

**Pourquoi on ne les retire pas tout de suite, et ce n'est pas de la timidité** : le
clone déployé du cockpit porte **44 commits non publiés**, dont un (`b645238`) réécrit
`.mcp.json` avec les anciens noms. Le jour où Skippy-pod rebase et publie, ce commit
repasse — et c'est exactement ce que les replis absorbent. Les supprimer avant sa
publication, c'est transformer un conflit de texte en panne d'outils. Ils partiront en
une seule livraison **après** son prochain push.

⚠️ **Le verrou n'est pas technique, il est chez Skippy-pod** : son clone du cockpit porte
**44 commits non publiés**, qui attendent un bouclier (il le sait, c'est écrit dans son
propre status). Un `memory-sync pull` tenté depuis le Mac le 2026-08-20 a été **abandonné
volontairement** — 13 conflits sur 43 commits, dans du travail dont je n'ai pas le
contexte. Ce n'est pas à faire de l'extérieur : c'est une session avec Monsieur, bouclier
armé. Le pod est resté intact.

Quand il publiera, un conflit l'attend sur `.mcp.json` — et il est désormais **sans
enjeu** : le `.mcp.json` de son clone a été aligné sur `origin` (fichier seul, ses 44
commits intacts), donc c'est la version d'`origin` qui fait foi des deux côtés.

> **Le chemin `unifi-agent` n'existe plus** (2026-08-20). Il contournait l'OAuth parce
> qu'un pod headless ne savait pas s'authentifier — un manque comblé DÈS LE LENDEMAIN de
> sa création par le fork `antor.2` du proxy (mode trusted-token). Il restait donc une
> voie plus faible vers l'admin de l'UDM, sans nécessité, trois jours de plus. Vérifié
> avant de démonter, par le code même de l'agent : le jeton de Skippy porte l'audience
> de l'hôte OAuth d'UniFi, et un `initialize` MCP en Bearer répond **200**. Consommateur
> migré d'abord, chemin retiré ensuite — aucune fenêtre sans réseau.
>
> ⚠️ Piège rencontré, et il resservira : les applications ArgoCD sont en `automated: {}`
> **sans `prune`**. Supprimer un manifeste ne supprime pas ses objets, et une synchro
> déclenchée sur une révision encore en cache les **recrée** — c'est arrivé, 20 s après
> la suppression. Le geste correct : pousser, ATTENDRE que l'application affiche la
> bonne révision, puis supprimer à la main.

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
