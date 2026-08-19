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

> ⚠️ **AMENDÉ le 2026-08-14 — `administration: write` est entrée, pour la seule création.**
> Monsieur a tranché : le pod doit créer ses dépôts depuis la PWA (sujet
> `creation-repo-pod` côté Alfred). L'App porte donc « Administration » (écriture) —
> ajoutée et approuvée sur l'installation le 14/08. Le périmètre effectif reste borné
> par la surface : un seul outil s'en sert, `repo_create` (rosetta ≥ 0.18.0), qui ne
> sait faire qu'un dépôt **privé, vide, sous le compte de l'appelant** — création pure,
> sous bouclier. Suppression, réglages, collaborateurs : toujours aucune surface, et un
> changement de permissions ne prend effet qu'APPROUVÉ côté installation.

### Le bouclier garde l'écriture, pas le token

Le périmètre du token est cosmétique : ce qui borne Skippy, c'est la surface exposée
par l'addon et le hook. Toute écriture passe sous 🛡 en headless.

**Granularité** — le bouclier est à usage unique (120 s, une action). Un armement par
commit serait invivable pour un agent de code, et une garde invivable finit contournée.
Donc : les commits sont **locaux** (aucun credential dans le pod, `git push` échoue de
lui-même), et la seule écriture réelle est l'appel MCP. Un `repo_commit` = un travail
publié = un bouclier. Deux ou trois armements par session, pas vingt.

> ⚠️ **AMENDÉ le 2026-08-10 — `git push` fonctionne désormais, et l'unité reste la même.**
> Ce qui précède reste vrai sur le fond (aucun credential GitHub dans le pod), mais la
> conclusion « donc les commits restent locaux » est **périmée** : voir la section
> « Publier son propre travail » ci-dessous. Le 2026-08-09, `repo_commit` a fait échouer une
> livraison réelle — 186 Ko à retaper dans l'appel d'outil, dont un `main.py` de 72 Ko — et
> il a fallu un humain pour sortir les commits du pod en `git bundle`.

### Publier son propre travail : `git push` vers le hub (depuis 2026-08-10)

**Le pod ne détient toujours aucun credential GitHub.** Il pousse vers **rosetta**
(addon `git`, ≥ 0.14.0), qui relaie vers GitHub avec le jeton de l'App. Le credential ne
quitte jamais le hub — l'invariant de la l. 26 est intact, son coût a disparu.

```
git remote set-url origin "$HUB_URL/git/<owner>/<repo>"
```

> **La procédure complète a déménagé — et c'est le fond, pas la forme.** Elle vit
> désormais dans le **plugin `git`** de l'image (`plugins/git/skills/git-push/`), donc
> elle descend avec le binaire qui l'applique et ne peut plus en dériver. Elle n'est
> chargée que par un corps qui a `git` dans `GW_TOOLS` : publier n'est pas donné à tous.
> Le `git config` du helper n'est plus à taper — le `setup` du plugin le pose à chaque
> démarrage, ce qu'une commande manuelle ne survivait pas à la recréation d'un pod.
> Ce qui suit reste vrai, mais c'est la skill qui fait foi.

⚠️ **Ne cherche pas un outil MCP : il n'y en a pas.** La surface de cet addon est du **HTTP
nu** (`info/refs`, `git-receive-pack`, `git-upload-pack`), donc invisible dans une liste
d'outils. Chercher `git_*` dans le MCP et conclure que le proxy n'existe pas est l'erreur
naturelle — elle a été commise le jour même de la mise en service.

**Où est passée la garde**, puisque le hook ne voit pas une commande shell :

1. **`git-credential-rosetta`** (image agent-gw ≥ 0.58.0) est la **seule source du jeton**.
   Il lit `GW_CHANNEL` — hors d'atteinte du modèle — et applique la sémantique de
   `google_guard.py` : canal absent → servi ; `planif` → refus sec ; sinon (PWA) → **un
   bouclier consommé par push**. Le contourner ne contourne pas une garde : ça laisse sans
   rien à pousser. L'unité « un travail publié = un bouclier » est donc préservée.
2. **rosetta lit le tuyau, qui n'est pas opaque.** Les commandes de ref voyagent en
   **pkt-line en clair** avant le pack : le hub refuse suppression de ref, ref hors
   `refs/heads/*`+`refs/tags/*`, déplacement d'un tag, et push non fast-forward — ce dernier
   vérifié par `/compare`, **parce que le protocole ne porte aucun drapeau de force et que
   GitHub accepte un force-push sur une branche non protégée**.
3. **L'identité doit être humaine** (`identity = "user"`) : le jeton GitHub est rangé par
   `sub`. Un `ROSETTA_USER_TOKEN` n'existe que dans un tour lancé par la gateway — donc un
   push ne part **jamais** d'un `kubectl exec`, ni d'une horloge.

> 🔎 **Le repli « pousse depuis le tunnel VS Code » n'a jamais existé.** Le `GITHUB_TOKEN`
> du pod (`apps/skippy`, `gh_pat_readonly`) est en lecture seule — sondé le 2026-08-10 :
> `Write access to repository not granted`, 403 sur receive-pack. Avant le proxy, la seule
> voie de sortie était qu'un humain extraie les commits à la main.

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
| `repo_create(nom, description)` | un dépôt NEUF : privé, vide, compte de l'appelant — création pure, nom pris = refus (0.18.0, cf. l'amendement du 2026-08-14) |
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

Suppression de repo, passage d'un dépôt en public, fork, suppression de branche,
force-push. Issues, PR, commentaires (surface de sortie, aucun besoin). Secrets
d'Actions, réglages du repo, collaborateurs. *(La création, longtemps de cette liste,
est passée côté écritures le 2026-08-14 — voir l'amendement.)*

Ouvrir l'un d'eux plus tard = **écrire l'outil**, pas basculer un flag — et relire la
garde dans la même passe.

## Le hook `github_guard.py`

Copie de `google_guard.py` : allowlist stricte, fail-closed, sémantique par canal.

- `GW_CHANNEL` absent (VS Code, humain devant) → écriture libre
- headless (PWA) → bouclier sur les écritures
- `planif` → **écritures fermées** (personne ne peut armer). Les lectures, elles,
  restent ouvertes : un `.agent/status.md` est du contenu qu'on a écrit soi-même, pas
  un mail hostile. C'est ce qui rend possible un tour d'horloge « rafraîchis le tableau ».

## Charte graphique (validée 2026-07-30)

Identité **distincte d'Alfred**, et construite en contrepoint terme à terme : lui est clair,
sérif, teal, coins à 13 px, ombres douces. Skippy est sombre, **monospace en titrage**,
ambre, coins à 3 px, et **sans aucune ombre** — de la lumière émise (filets d'un pixel sur
les arêtes, halos) plutôt que de la profondeur simulée.

### Jetons

```
--void #080A0D   --hull #101419   --hull2 #171C23   --raise #1F252E
--rivet #242B34  --alloy #D7DEE6  --dim #8E98A5     --faint #5C6570  --ghost #2C333C
--amber #F2A93B (accent unique)   --amber-deep #B8781E   --amber-low #6B4712
--ok #3FBF86 (réservé)            --hot #E8543F (réservé)
```

Neutres à biais bleu froid (de l'alliage, pas du gris). Clair : mêmes jetons inversés avec
l'ambre descendu à `#B0731A` pour tenir le contraste sur fond pâle — **pas** une inversion
naïve. Rayon 3 px partout. Typo : monospace système en display **et** en donnée (chiffres en
`tabular-nums`), sans-serif système pour la prose seule. **Aucun webfont** — le mono système
est le parti pris, pas un pis-aller.

### Trois règles dures

1. **Un seul accent.** L'ambre, partout. Pas de teinte par tuile : la v1 en avait, le
   validateur a montré que son bleu passait sous le plancher de chroma (lisait comme du
   gris). Les tuiles se distinguent par leur libellé, jamais par leur teinte.
2. **Vert et rouge sont des états réservés**, jamais des accents — et jamais seuls. Mesuré :
   amber↔vert tombe à **ΔE 8,0 en protanopie**, tout juste au plancher, ce qui n'est légal
   qu'avec encodage secondaire. Donc **chaque pastille porte son libellé écrit**
   (« CI · 8/10 vertes », « à déployer ») et chaque bande de builds annonce son compte.
3. **Le noyau est un composant, pas un ornement.** Une horloge canvas (72 graduations,
   trois anneaux contrarotatifs, cœur pulsé) instanciée en 180 px sur la passerelle et en
   44 px dans le fil avec un multiplicateur de vitesse : **au repos il dérive, au travail il
   tourne**. C'est l'indicateur d'activité, ce qui lui donne une raison d'exister.

### Ce que le chat montre, et pourquoi

La surface principale (défaut mobile, rail flotte à droite en desktop) diverge d'Alfred sur
trois points, tous justifiés par le métier :

- **La trace d'outils est visible** (`◇ actions_runs · esphome-projects`, repliée sous son
  compte). Un agent de code qui cache ce qu'il touche est un agent qu'on ne peut pas
  corriger — Alfred peut se permettre la discrétion, pas Skippy.
- **Le poids de session est permanent** dans la barre haute : un tour de code consomme du
  contexte à une vitesse qu'un tour de majordome ne connaît pas.
- **Le bouclier vit dans le fil**, dépôt nommé et nombre de fichiers annoncés, son état armé
  reflété dans le composeur avec décompte. On n'arme jamais quelque chose d'abstrait.

Tout le mouvement (noyau, poussière ambiante, entrée en cascade, curseur) s'arrête net sous
`prefers-reduced-motion`.

### Mise en œuvre

**Un jeu de variables CSS de plus, pas un second front** : `launcher.css` déclare déjà tous
ses jetons sur `:root`. Une feuille de thème par agent, sélectionnée par le même mécanisme
que `GW_APPS`, et les deux corps gardent le même bundle. ⚠️ À faire au passage : la classe
racine du moteur de contenu s'appelle `.alfred-doc` — un pod Skippy porterait le nom du
majordome dans son DOM. Renommer en `.agent-doc`.

Maquette de référence (5 écrans, hors repo) : artefact « Skippy — charte graphique ».

## Reste à faire

- [x] **Question bloquante — tranchée sur la doc (2026-07-29).** Un push par token
      d'App déclenche bien les workflows : la restriction ne vise que le
      `GITHUB_TOKEN` d'Actions. La chaîne `tag → CI → image → bump → ArgoCD` tient,
      et `actions_run` disparaît de la surface. Confirmation empirique gratuite au
      premier `repo_commit` réel — inutile de monter une App juste pour l'éprouver.
- [x] **GitHub App créée**, addon `github` dans `rosetta-mcp`, `github_guard.py` et son
      `settings.json` dans le cockpit — la chaîne complète tourne. Puis **l'addon `git`**
      (rosetta 0.14.0/0.15.0) qui rend `repo_commit` accessoire pour publier : voir la
      section « Publier son propre travail » plus haut.
- [x] `GW_APPS` dans agent-gw. Les modules du lanceur sont sélectionnables par env,
      publiés sur `/api/version`, lus au boot ; tuile **et** route masquées ensemble.
      Rejoint depuis par `GW_FEATURES` (ce que le chat sait faire) et **`GW_TOOLS`** (ce
      que l'agent a dans les mains — c'est là que vit `git`).
- [x] Vue `repos` : le tableau des `.agent/status.md` de la flotte. Devenue un plugin
      à part entière (`plugins/repos/`), API comprise.
- [x] **Thème par agent — DÉPLOYÉ** (`GW_THEME`, agent-gw 0.36.0/0.37.0) : surcharge de
      jetons scopée par `data-agent`, plus la trace d'outils (`GW_TRACE`), le noyau en
      indicateur de travail et le calque fantôme. Reste du palier 2 non fait, et assumé :
      **réglettes graduées et équerres d'angle** — pur décor, demandant du markup neuf.
- [x] `.alfred-doc` → `.agent-doc` : plus une seule occurrence du nom du majordome dans
      le DOM d'un pod de code.
- [x] Repo « cockpit » (`skippy-cockpit`) = `/workspace` du pod, avec son `repos.yml`.
- [x] `skippy-helm.yml` dans k8s-home-lab.
- [ ] **Le dernier chemin non éprouvé** : un push sur `main` depuis le pod (et non sur
      une branche neuve). Et la branche `pod/git-0.15.0`, fusionnée, traîne sur `origin` —
      le proxy refuse les suppressions de ref, donc c'est un geste du Mac.

## Notes

- Les deux pods partagent le même abonnement Claude (`CLAUDE_CODE_OAUTH_TOKEN`) —
  limites communes.
- Le endpoint `/mcp` d'agent-gw donne `ask_skippy` gratuitement, symétrique
  d'`ask_alfred` : Alfred pourra déléguer ses tâches techniques.
- 12 repos sur 23 ont un `.agent/status.md` ; les autres sont vides *par design*
  (« pas de rétro-doc »). Deux traînards ont encore un `STATUS.md` à la racine —
  l'agrégateur doit tolérer les deux, ou on normalise avant.
