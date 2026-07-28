# Pod Skippy — design (fichier de travail)

> Statut : **design validé, rien de construit.** Notes de conception, pas une doc de
> produit. Le pod Skippy est un second corps monté sur les mêmes images que le pod
> Alfred — les images sont déjà agent-agnostiques, l'identité vient du `/workspace`.

## Objectif

Un Skippy toujours allumé, pour les opérations techniques, avec dans la PWA un
**tableau de bord de la flotte** : les `.agent/status.md` de tous les repos, agrégés.

## Ce qui existe déjà et sert tel quel

- `claude-pod` + `agent-gw` : agent-agnostiques par construction.
- La norme `.agent/status.md` (chemin fixe) — écrite pour rendre l'agrégation possible.
- `rosetta-mcp` : hub MCP, resource server OAuth 2.1, addons montés par chemin, et
  surtout le patron **credentials côté serveur** (addon `google` : `identity = "user"`,
  store par `sub`, enrôlement navigateur, l'agent ne voit jamais le token).
- Le bouclier 🛡 (`/api/confirm`) + le patron de hook `PreToolUse` de
  `google_guard.py` (repo Alfred).

## Décisions

### Accès GitHub : addon `github` dans rosetta, pas de PAT dans le pod

Le token ne doit jamais être atteignable depuis le shell du pod — sinon le hook ne
garde que les gens polis. L'addon `github` reprend le patron de l'addon `google` :
credential côté tantive, enrôlement navigateur, `identity = "user"`.

Corollaire : l'addon est **fait maison**, comme `google`. On n'embarque pas
`github/github-mcp-server` — sa surface est trop large, et il lui manque de toute
façon la création de tag (aucun `create_tag` / `create_ref` ; le toolset `git` ne
contient qu'un `get_repository_tree`).

### GitHub App, installée sur *tous* les repos

Parité avec ce que Skippy a déjà sur le Mac. Le choix de l'App plutôt que d'une OAuth
App classique ne change **rien** aujourd'hui (même flow, même refresh token, même
store par `sub`, même pouvoir) mais permet de resserrer plus tard depuis l'UI GitHub,
sans une ligne de code ni de ré-enrôlement. Le scope `repo` d'une OAuth App, lui, est
définitif.

Permissions de l'App :

- `contents: write`, `metadata: read`, `actions: read`
- **`workflows: write`** — obligatoire pour committer sous `.github/workflows/`,
  distincte de `contents: write`. Sans elle, le premier commit sur une CI échoue sans
  cause évidente.
- **jamais** `administration`, ni les secrets, ni les collaborateurs.

### Le bouclier garde l'écriture, pas le token

Le périmètre du token est cosmétique : ce qui borne Skippy, c'est la surface exposée
par l'addon et le hook. Toute écriture passe sous 🛡 en headless.

**Granularité** — le bouclier est à usage unique (120 s, une action). Un armement par
commit serait invivable pour un agent de code, et une garde invivable finit contournée.
Donc : les commits sont **locaux** (aucun credential dans le pod, `git push` échoue de
lui-même), et la seule écriture réelle est l'appel MCP. Un `repo_commit` = un travail
publié = un bouclier. Deux ou trois armements par session, pas vingt.

## Surface de l'addon `github`

### Lectures — libres

| Outil | Rôle |
|---|---|
| `repo_list` | la flotte accessible |
| `repo_file` | un fichier à un ref — alimente le tableau de bord `.agent/status.md` |
| `repo_tree` | l'arborescence à un ref |
| `repo_commits` | l'historique |
| `repo_search_code` | recherche à travers la flotte |
| `repo_tags` | les tags existants (dernière version publiée d'une image) |
| `actions_runs` | état des runs CI |

### Écritures — sous bouclier 🛡

| Outil | Rôle |
|---|---|
| `repo_commit(repo, branch, message, files[{path, content \| null}])` | créer / modifier / supprimer, atomique. `content: null` = suppression : pas d'outil `delete_file` séparé à débloquer un jour |
| `repo_tag(repo, tag, sha)` | pose la ref — la release |

`actions_run` (dispatch de workflow) était prévu comme roue de secours si un push
d'App ne déclenchait pas la CI. **Inutile** : la restriction « ne relance pas de
workflow » vise uniquement le `GITHUB_TOKEN` d'Actions (garde-fou anti-récursion),
pas les tokens d'App — la doc recommande explicitement un installation access token
pour *contourner* cette limite. Et notre token est *user-to-server* : le push est
attribué à l'utilisateur, comme un push depuis le Mac. Donc pas d'outil de dispatch :
une capacité de moins à garder. Relancer un build raté se fait depuis l'UI GitHub.

### Jamais écrits — c'est ça, la garantie

Création / suppression de repo, fork, suppression de branche, force-push. Issues, PR,
commentaires (surface de sortie, aucun besoin). Secrets d'Actions, réglages du repo,
collaborateurs.

Ouvrir l'un d'eux plus tard = **écrire l'outil**, pas basculer un flag — et relire la
garde dans la même passe.

## Le hook `github_guard.py`

Copie de `google_guard.py` : allowlist stricte, fail-closed, sémantique par canal.

- `GW_CHANNEL` absent (VS Code, humain devant) → écriture libre
- headless (PWA) → bouclier sur les écritures
- `planif` → **écritures fermées** (personne ne peut armer). Les lectures, elles,
  restent ouvertes : un `.agent/status.md` est du contenu qu'on a écrit soi-même, pas
  un mail hostile. C'est ce qui rend possible un tour d'horloge « rafraîchis le tableau ».

## Reste à faire

- [x] **Question bloquante — tranchée sur la doc (2026-07-29).** Un push par token
      d'App déclenche bien les workflows : la restriction ne vise que le
      `GITHUB_TOKEN` d'Actions. La chaîne `tag → CI → image → bump → ArgoCD` tient,
      et `actions_run` disparaît de la surface. Confirmation empirique gratuite au
      premier `repo_commit` réel — inutile de monter une App juste pour l'éprouver.
- [ ] **Créer la GitHub App** (geste navigateur) : permissions `contents: write`,
      `metadata: read`, `actions: read`, **`workflows: write`** ; jetons utilisateur
      expirants activés (refresh token) ; installée sur tous les repos.
- [ ] Addon `github` dans `rosetta-mcp` (le gros morceau)
- [ ] `github_guard.py` + son `settings.json`
- [x] `GW_APPS` dans agent-gw — **fait, non tagué.** Les modules du lanceur sont
      sélectionnables par env, publiés sur `/api/version`, lus au boot ; tuile **et**
      route masquées ensemble. La mémoire reste hors module. Défaut = jeu historique
      (Alfred ne bouge pas). C'est la brique commune aux deux corps.
- [ ] Vue `repos` : tableau des `.agent/status.md` de la flotte, lus depuis origin
- [ ] Repo « cockpit » = `/workspace` du pod (CLAUDE.md de Skippy + manifeste de la
      flotte). Le modèle mono-repo d'Alfred ne tient pas : Skippy opère sur ~23 repos.
- [ ] `skippy-helm.yml` dans k8s-home-lab (copie d'`alfred-helm.yml` : fullname, hôte,
      client Authelia, `TUNNEL_NAME`, hostPath)

## Notes

- Les deux pods partagent le même abonnement Claude (`CLAUDE_CODE_OAUTH_TOKEN`) —
  limites communes.
- Le endpoint `/mcp` d'agent-gw donne `ask_skippy` gratuitement, symétrique
  d'`ask_alfred` : Alfred pourra déléguer ses tâches techniques.
- 12 repos sur 23 ont un `.agent/status.md` ; les autres sont vides *par design*
  (« pas de rétro-doc »). Deux traînards ont encore un `STATUS.md` à la racine —
  l'agrégateur doit tolérer les deux, ou on normalise avant.
