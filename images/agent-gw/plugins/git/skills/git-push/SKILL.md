---
name: git-push
description: >
  Comment PUBLIER du code depuis ce corps : `git push` vers le hub rosetta, qui relaie
  vers GitHub. À consulter avant tout push, et dès qu'un push est refusé — les refus
  sont des messages, pas des pannes, et chacun dit quoi faire. Livré par l'image avec
  le credential helper qui décide si le push part. Ce que tu publies et pourquoi reste
  dans le CLAUDE.md de ton workspace.
---

# Publier : `git push` vers le hub

Ce corps ne détient **aucun credential GitHub**. C'est structurel, pas une politesse :
il n'y a rien à trouver dans l'environnement. Le push part vers le **hub rosetta**
(addon `git`), qui relaie vers GitHub avec le jeton de l'App — jeton qui ne quitte
jamais le hub.

**Portée.** La procédure et les refus. La décision de publier — quoi, quand, sur quel
dépôt — appartient à ton workspace.

## Le câblage — déjà fait, ne le refais pas

Le `setup` de ce plugin pose le helper à **chaque démarrage** du corps :

```
git config --global "credential.$HUB_URL.helper" hub
```

Il ne reste qu'à faire pointer le dépôt vers le hub, une fois par clone :

```
git remote set-url origin "$HUB_URL/git/<owner>/<repo>"
```

⚠️ **Ne cherche pas un outil MCP `git_*` : il n'y en a pas.** La surface de cet addon
est du **HTTP nu** (`info/refs`, `git-receive-pack`, `git-upload-pack`), donc invisible
dans une liste d'outils. En conclure que le proxy n'existe pas est l'erreur naturelle —
elle a été commise le jour même de la mise en service.

Le `fetch` et le `clone` passent par le même chemin : un dépôt **privé** se clone sans
credential, ce qui vaut mieux que de reconstituer un arbre fichier par fichier.

## Ce que le helper décide, et ce qu'il refuse

`git-credential-rosetta` est la **seule source du jeton**. Le contourner ne contourne
pas une garde : ça laisse sans rien à pousser. Il lit `GW_CHANNEL`, hors d'atteinte du
modèle, et applique la sémantique de `google_guard.py` :

| Canal | Ce qui se passe |
|---|---|
| absent (session VS Code) | servi — un humain est au clavier |
| `planif` (tour d'horloge) | **refus sec.** Personne n'est devant pour armer le bouclier, et rien de ce qu'une horloge décide ne doit devenir un objet partagé |
| autre (PWA) | **un bouclier consommé par push.** Un travail publié = une autorisation |

Un refus n'écrit rien sur la sortie standard : git y voit « pas de credential » et
échoue sur l'authentification, tandis que **la raison part sur stderr**. Lis-la, elle
te dit lequel des trois cas tu es.

Trois messages, trois gestes :

- **« aucune autorisation PWA active »** → demande à Monsieur de taper le bouclier 🛡
  (valable 120 s), puis relance le push. Une action par bouclier.
- **« tour planifié »** → n'insiste pas. Ce qui publie se fait en session ordinaire.
- **« ROSETTA_USER_TOKEN absent »** → le proxy exige une identité **humaine** (le jeton
  GitHub est rangé par `sub` côté hub) ; une identité machine reçoit un 403. Ce jeton
  n'existe que dans un tour lancé par la gateway : un push ne part donc **jamais** d'un
  `kubectl exec`.

## Ce que le hub refuse, quoi que tu fasses

Les commandes de ref voyagent en **pkt-line en clair** avant le pack : le hub les lit
sans jamais ouvrir le packfile, et refuse la **suppression de ref**, une ref hors
`refs/heads/*` et `refs/tags/*`, le **déplacement d'un tag**, et le **push non
fast-forward**.

Ce dernier est vérifié côté serveur après réception sur une ref jetable, et c'est
délibéré : **le protocole ne porte aucun drapeau de force**, et GitHub accepte un
force-push sur une branche non protégée. Une vérification d'ascendance faite avant
l'envoi interrogerait GitHub sur un commit qu'il n'a pas encore — elle répondait 404,
et refusait toute mise à jour d'une branche existante.

Conséquence pratique : **une branche fusionnée ne se supprime pas d'ici.** C'est un
geste du Mac.
