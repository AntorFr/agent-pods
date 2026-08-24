# Status — agent-pods
> MàJ : 2026-08-24

🧯 **Le scope `mail` entre dans la demande OIDC — 0.82.0 (2026-08-24).** Le login
demandait `openid profile email groups offline_access` ; il demande `mail` en plus.
Sans lui, le claim `mail_local` — déclaré côté Authelia depuis le 13/08 — n'était
**jamais accordé** : un `custom_claims` rend un claim *disponible* à la policy, et
Authelia ne le copie dans l'access token que si un scope accordé le **porte**. Les
autres, il les saute **en silence**. Résultat : l'addon `mail` du hub (boîte IMAP de
la maison) se faisait refuser par le coffre en HTTP 400 du 13/08 au 24/08, pendant que
Gmail — qui se repère sur `preferred_username`, standard donc accordé — fonctionnait :
c'est ce contraste qui a fait accuser le coffre à tort.

⚠️ **Ordre de déploiement non négociable** : Authelia d'abord, l'image ensuite. Un
scope demandé mais absent du client côté Authelia rend `invalid_scope` à
l'autorisation — c'est-à-dire **plus aucun login** sur le corps concerné.
⚠️ **Une reconnexion PWA est requise, un refresh ne suffit pas** : les scopes accordés
sont gelés dans le grant, et `user_access_token()` rafraîchit sans envoyer `scope`.
Tant qu'un corps n'a pas re-loggé, son jeton reste dépourvu de `mail_local`.

🧯 **L'umask 002 descend dans l'image — 0.80.0 (2026-08-20).** Il vivait en `args` dans
deux manifestes k8s, ce qui y **recopiait le CMD** de l'image : la commande de démarrage
aurait changé un jour, et ces déploiements auraient épinglé l'ancienne, en silence. Il est
désormais dans un `entrypoint.sh` à la racine de l'image (même convention que `claude-pod`),
qui ne fait qu'une chose — `umask 002` puis `exec "$@"` — donc le CMD reste déclaratif et
n'est dupliqué nulle part. Les `args` ont disparu des trois manifestes.

Sans ce bit, la co-édition du cercle `famille` est cassée à moitié : les deux corps y
écrivent sous des **UID différents** (3000 et 1000), réunis par un seul groupe secondaire —
chacun peut CRÉER, aucun ne peut MODIFIER le fichier de l'autre, et ça ne se voit qu'au
premier `Edit` refusé. Aucune ACL serveur ne peut s'y substituer : en NFS l'umask est
appliqué **côté client**.

> ✅ **Prouvé de bout en bout, ce qui ne l'avait jamais été.** Un `kubectl exec` démarre un
> processus neuf qui **court-circuite l'entrypoint** : il mesure l'umask de l'image, pas
> celui de la gateway — mes tests précédents (avec les `args`) posaient `umask 002` à la main
> dans le shell de test et ne prouvaient donc que la mécanique POSIX, jamais la chaîne réelle.
> La vraie vérification est de faire écrire l'**agent** : fichier créé en **`660 3000:3002`**.
> Complété par un build local (uvicorn démarre en `Umask 0002` via le CMD par défaut, contre
> `0022` sans l'entrypoint) et cinq checks dans `bin_test`.

⏱ **Les planifs sont des INSTRUCTIONS, et `instruction-sync` reprend le flambeau —
DÉPLOYÉ en 0.79.1 (2026-08-20).** Deux gestes d'une même décision de Monsieur : mettre fin
à la divergence entre corps sur l'emplacement des planifications, et rendre aux
instructions la synchro qu'on venait de retirer à la mémoire.

**La divergence, que personne n'avait vue**, parce qu'elle ne se lisait sur aucun fichier :
`_planif_root()` se construisait sur `GW_MEMORY_DIR`, donc chaque corps rangeait ses
planifs là où il rangeait sa mémoire.

| | `memory/` | planif |
|---|---|---|
| Alfred | PVC NFS monté **sur** `/workspace/memory` | **hors git** depuis D49 |
| Skippy | hostPath du workspace | **dans git** |
| Nestor | aucun (magasin = `/shared/famille`) | **impossible** |

Le dernier cas dit tout : avoir une horloge supposait d'avoir un magasin mémoire — deux
choses sans rapport, soudées par un chemin. **`GW_PLANIF_DIR` devient relatif au
WORKSPACE** (défaut `memory/planif`, rétro-compatible octet pour octet) ; les trois
manifestes déclarent `planif`, et les deux fiches ont été déplacées.

Le fond : le corps d'une fiche `type: planif` est exécuté **tel quel** comme prompt (D30).
C'est une instruction, donc du versionné — la seule chose qu'on ne peut pas se permettre de
perdre sur du prompt exécutable, c'est le diff et le revert.

> 🛡 **Deux gardes en sortent renforcées, pas levées.** ① Chez Alfred, `/workspace/memory`
> est un point de montage NFS : `planif/` étant **à côté** et non dedans, la ligne `memory/`
> du `.gitignore` reste **sans exception**. ② Chez Nestor, tenir l'horloge désarmée reposait
> sur un effet de bord (`GW_MEMORY_DIR` laissé inexistant) parce que son unique magasin est
> **partagé** avec Alfred ; c'est désormais structurel — `/workspace/planif` n'appartient à
> aucun magasin, donc rien d'écrit dans `famille` ne peut armer une horloge. Et Nestor gagne
> la capacité au passage.

**`instruction-sync`** (`bin/`) n'est pas `memory-sync` déguisé. Le retirer a révélé ce
qu'il faisait vraiment : sa justification n'a jamais été la mémoire mais la **co-édition**,
qui n'a pas disparu — elle a changé d'objet. La mémoire a un seul écrivain et plus aucun
remote ; les instructions (`CLAUDE.md`, `DECISIONS.md`, `.claude/`, `planif/`) ont deux
auteurs — le pod et la machine de dev — et un `origin`. Même boucle, conflit **remonté** et
non deviné, stage par chemin explicite, helper scopé sur github.com. Plus une garde neuve :
**il refuse de tourner si `memory/` est redevenu suivi par git**, avant tout geste réseau.

> ⚠️ **Ce n'est pas un outil de confort, c'est un canal d'exécution.** Avec `planif/` en
> git, `pull` ne rapatrie plus seulement du texte : il rapatrie des instructions qui
> tourneront ici. Sain tant que les seuls auteurs sont Monsieur et l'agent lui-même.

> ☠️ **0.79.0 livrait le CONTRAIRE de son intention, et le banc ne l'a pas vu.**
> `planif_list()` reconstruit sa réponse **clé par clé** ; le champ `dans_memoire` s'y
> perdait. Le front lisait `undefined`, concluait « dans la mémoire » et fabriquait le lien
> `#/mem/…` mort que la version prétendait justement supprimer — sans une seule erreur.
> Trouvé en interrogeant les pods **après** déploiement, corrigé en 0.79.1. **La leçon :
> tester la fonction ne teste pas la réponse.** `planif_root_test.py` couvre désormais les
> deux, dans les deux configurations, et a été éprouvé à l'envers.

🗑️ **`memory-sync` est RETIRÉ du corps — livré en 0.79.0 (2026-08-20).** La mémoire d'Alfred a
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

**État :** Trois images en production, **déployées** — `agent-gw` 0.82.0 sur les trois
corps (Alfred, Skippy, Nestor), `claude-pod` 0.7.0, `agent-voice` 0.3.0. L'identité vient
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

**Le dé-marquage est SOLDÉ** (2026-08-20). Les replis qui avaient permis la transition
ont été retirés d'un bloc, sur décision de Monsieur — « on fait propre, au pire on
corrigera ». Ils n'avaient plus aucun consommateur, vérifié sur les trois pods avant de
couper : plus d'alias `rosetta-bridge`, plus de lecture des `ROSETTA_*`, plus de double
injection du jeton, plus de repli `ALFRED_VOICE_*` ni de backend `"alfred"`.

`agent-pods` ET `rosetta-mcp` — les deux dépôts **publics** — ne contiennent plus une
seule occurrence de mon domaine. Côté hub (`rosetta-mcp` 0.20.0), c'était 12 défauts
FONCTIONNELS et non de la prose, dont un qui comptait double : `POSTIER_ALLOWED` valait
`*@<mon domaine>`, ce qui publiait le domaine **et** ouvrait tout un domaine aux envois
de mail sans que le déploiement l'ait demandé. Il est maintenant **fail-closed**.

Vérifié bout en bout après coup : le jeton d'un agent atteint `maps`, `github` et
`meteo` du hub en HTTP 200, et le pont refuse proprement sans `HUB_URL`.

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
- [x] **Un job de test dans la CI — FAIT le 2026-08-20.** Le workflow construisait et
      publiait sans jamais rien exécuter. Deux gardes désormais, et elles ne se
      recouvrent pas : un job `test` en amont (12 suites Python + 7 front, `build` en
      dépend), et surtout un **smoke DANS l'image fraîchement construite**, chargée en
      local avant publication. C'est le second qui compte : les bancs tournent sur un
      venv à la résolution figée, seule une image neuve voit une dérive de dépendance.
      Vérifié qu'il MORD — en forçant `mcp==2.0.0`, l'import échoue et la CI tombe.
- [ ] Un push sur `main` **depuis le pod** — le dernier chemin du proxy git non éprouvé
      (les branches neuves, elles, passent depuis le 2026-08-10).
- [x] **La frontière est franchie (2026-08-20).** Un plugin peut livrer une INTERFACE,
      pas seulement un contrat : une vue du lanceur (`web/app.js` + tuile au manifeste),
      des blocs Markdoc pour le moteur (`web/blocks.js`), et du chrome — contrôle du
      composeur, entrée des Réglages, modale (`web/chrome.js`). Quatrième sorte,
      `capacite`, gardée par `GW_FEATURES`, l'axe qui existait déjà : aucun manifeste de
      pod n'a bougé. Trois pilotes rentrés chez eux — `repos`, `parcours`, `scan`.
      Le lot 3 était une INVERSION, pas un déplacement : la coque contenait tout et
      `GW_FEATURES` ne faisait que retrancher, donc rien ne pouvait s'ajouter.
      ✅ Scanner constaté par Monsieur le 2026-08-20, **sur le Mac ET sur iOS** — donc
      les DEUX décodeurs : le natif `BarcodeDetector` et le repli `/static/scan.js`
      chargé à la demande (iOS Safari n'a pas l'API), qui est le cas d'usage réel.
      Le lot 3 est clos : rien n'y reste à constater.
- [ ] Côté cerveau (Alfred, pas ici) : réécrire les 17 jonctions d'`imp3d` sous
      `jonctions[]` et déclarer les `appui`.

> Ce fichier est une **synthèse**, pas un journal : l'historique détaillé de chaque
> chantier est dans `git log` (messages de commit longs, un par intention) et le
> « pourquoi » des choix dans les commentaires du code et les archives de conception
> (`plugins/*/`, `REDESIGN.md`) — chaque archive vit désormais à côté du plugin
> qu'elle décrit.
