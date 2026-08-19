# Les plugins — ce qu'on ajoute au corps sans toucher au corps

> Ce dossier est la **frontière**. Ce qui est ici étend un agent ; ce qui est dans
> `app/` est le corps lui-même. La règle qui tranche : **le corps ne connaît aucun
> plugin par son nom.** Il les découvre, décide lesquels sont actifs, branche ce
> qu'ils apportent. C'est la seule propriété qui rend un plugin déposable depuis un
> autre dépôt — et c'est elle qu'il ne faut pas casser.

## Un plugin = un dossier + un manifeste

```
plugins/<id>/
  gw-plugin.json            REQUIS — c'est lui qui fait du dossier un plugin
  .claude-plugin/plugin.json
  skills/<nom>/SKILL.md     le contrat que l'agent doit respecter
  api.py                    un `router` FastAPI, monté au démarrage
  setup                     un exécutable idempotent, lancé au démarrage
  bin/*                     des exécutables, posés sur le PATH au BUILD
  tools/*                   les outils du plugin Claude Code
```

Tout est optionnel **sauf `gw-plugin.json`**. Un plugin peut n'être qu'un contrat
(`fiches`), qu'un exécutable et sa procédure (`git`), ou les deux avec une API
(`voyages`). Rien ne se déclare : la **présence du fichier** au bon nom suffit —
le corps regarde, il ne lit pas une liste.

`<id>` est le **nom du dossier**, et c'est lui qui fait foi : c'est ce qu'on écrit
dans `GW_APPS` ou `GW_TOOLS`. Un `id` divergent dans le manifeste est signalé et
ignoré.

## Les trois sortes — `kind`

Un plugin n'est pas toujours une app. C'est ce que `kind` dit, et il décide **quand
le plugin est actif** :

| `kind` | Actif quand | Pour quoi |
|---|---|---|
| `socle` | **toujours** | Ce que tout agent doit avoir : le contrat d'écriture de la mémoire (`fiches`), ou une capacité du corps qui n'a pas de tuile (`parcours`). |
| `app` | son `id` est dans **`GW_APPS`** | Un module du lanceur : une tuile, une route, un format de données. |
| `outil` | son `id` est dans **`GW_TOOLS`** | Une capacité de l'agent — un exécutable, une procédure — **sans rien dans l'interface**. `git` en est le cas d'école : publier n'est pas un écran, et tous les corps n'y ont pas droit. |

Un `kind` inconnu n'est pas une valeur par défaut : le plugin est **ignoré**, avec
un message. Un plugin qu'on croit chargé et qui ne l'est pas coûte plus cher qu'un
plugin refusé bruyamment.

## Ce qu'un plugin ACTIF apporte

**`skills/` + `.claude-plugin/plugin.json`** — le contrat part au SDK Claude
(`ClaudeAgentOptions.plugins`). C'est la raison d'être du mécanisme : le contrat
**descend avec le code qui le lit**, dans le même tag d'image, donc il ne peut pas
en dériver. Un plugin sans `.claude-plugin/plugin.json` n'est pas passé au SDK —
il n'a simplement pas de contrat, ce n'est pas une erreur.

**`api.py`** — s'il expose un `router` (`fastapi.APIRouter`), il est monté au
démarrage. Un plugin **inactif ne monte pas son API** : c'est cohérent avec sa
tuile absente, et ça retire la surface au lieu de la laisser répondre dans le vide.
Une API qui refuse de s'importer est **signalée et sautée** — le corps continue de
servir. Un plugin cassé fait perdre sa vue, pas la gateway.

**`setup`** — lancé à chaque démarrage, donc **idempotent par contrat**. C'est ce
qui remplace les commandes qu'on tapait à la main dans le pod : un pod recréé les
perdait, et personne ne s'en apercevait avant le premier échec. 30 s de budget, et
sa sortie part dans les logs.

**`bin/`** — installé sur le PATH **au build**, pour tous les corps, sans condition.
Ce n'est pas un trou dans le gating : le Dockerfile ne connaît pas l'environnement
du pod, et un binaire est **inerte tant que rien ne l'appelle**. C'est `setup` qui
le câble, et lui n'est lancé que si le plugin est actif.

## Ce qui reste dans le corps, et pourquoi

Trois exécutables vivent à la racine d'`agent-gw`, pas dans un plugin :
`rosetta-bridge` (tout agent parle au hub), `memory-sync` (tout agent écrit sa
mémoire) et le noyau de chat. Ils ne sont pas optionnels — un corps sans eux n'est
pas un corps diminué, c'est un corps mort.

**L'horloge des planifications** (`app/planif.py`) reste elle aussi dans le corps,
alors qu'elle a une tuile. La raison est nette : elle a besoin de lancer un tour
d'agent (`_run_alfred`), donc de rappeler le corps. Un plugin qui rappelle le corps
n'est plus un plugin, c'est un morceau du corps rangé ailleurs. Sa tuile est gardée
par `GW_APPS` côté front, son horloge par `GW_PLANIF` — et les deux sont
indépendantes, ce qui est le comportement voulu : un corps sans module visible doit
continuer d'honorer ses tâches planifiées.

## Écrire un plugin — la liste courte

1. `plugins/<id>/gw-plugin.json` : `{"id": "<id>", "kind": "…", "description": "…"}`.
2. Ce qu'il apporte, aux noms ci-dessus. Rien à enregistrer nulle part.
3. `<id>` dans `GW_APPS` ou `GW_TOOLS` du pod (inutile pour un `socle`).

Le front, lui, garde son propre registre (`frontend/src/launcher/apps/index.js`) :
une app qui veut un **écran** doit encore y poser sa fabrique. C'est la dernière
frontière non franchie — un plugin tiers peut aujourd'hui livrer un contrat, une
API, un exécutable et sa procédure, mais pas encore une vue.
