# Status — agent-pods

> MàJ : 2026-07-31

**Contrat de thème + rail de chat rethémable — DÉPLOYÉ (2026-07-31, agent-gw 0.45.0)** : le
skin Skippy était une **surcharge de jetons**, mais la coque avait 83 rayons et 18 couleurs
**écrits en dur** — le rail de chat, la zone la plus ancienne, n'était donc pas rethémable du
tout. Symptômes visibles : bulles à 15 px au milieu d'une trace à 3 px, composeur en
sans-serif sous une charte monospace, et **aucune règle `pre`/`code`** (régression de la
bascule vers la nouvelle coque — l'ancien chat les avait). `launcher.css` porte désormais un
**contrat de thème** documenté en tête : fontes par **rôle** (`--f-title`/`--f-body`/
`--f-input`, fini `--serif` sur lequel Skippy « branchait du monospace »), échelle de rayons à
8 crans (`--r-micro` → `--r-round`), sur-aplat (`--on-accent`, `--on-solid`, `--scrim`),
plaques d'icône, bulles, code, signature (`--label-track`, `--caret-display`, `--ghosttag`).
`skippy.css` est redevenu une **déclaration pure** : plus une seule règle scopée par agent.
Chat : blocs de code, inline, titres et tables enfin stylés ; caret clignotant sur le
composeur (au repos seul) et sur l'invite de la passerelle, qui n'existait pas.

> ⚠️ **`.mosaic{}` nu dans `skippy.css` repeignait Alfred.** Une feuille de thème est chargée
> **inconditionnellement** (`skins/themes.css`) : toute règle non scopée y est active sur
> **tous** les corps. Celle-ci resserrait la grille d'accueil d'Alfred (190 px au lieu de 210)
> depuis le premier jour du skin, sans que personne le voie. Contrôle 3 du lint.

> 🔎 **Gotcha — un jeton ne peut pas contenir `var(--tc)`.** Une propriété personnalisée est
> substituée **à son site de déclaration**, puis hérite **déjà résolue**. Un
> `--plate-bg:linear-gradient(…,var(--tc),…)` posé sur `:root` calcule `--tc` sur `:root`
> (indéfini → valeur invalide garantie) et n'atteint jamais la tuile qui porte le `--tc`. Vaut
> pour tout ce qui dépend d'un ton posé en style inline (`--tc`/`--dc`/`--lc`/`--c`). D'où la
> composition par **scalaires** : la formule reste dans la règle partagée, seuls ses
> pourcentages sont des jetons (`--plate-top`/`--plate-mix`/`--plate-fg-tint`).

> 🔎 **`test/theme-lint.mjs` — la convention est vérifiée, pas espérée.** 4 contrôles :
> (1) aucune couleur littérale ni rayon en pixels dans la coque hors bloc de jetons ;
> (2) une règle scopée `[data-agent=…]` ne contient QUE des déclarations `--x` ;
> (3) une règle de thème non scopée doit viser du markup propre au skin ; (4) aucun `var(--x)`
> sans repli et non déclaré **dans sa portée** — par consommateur, pas sur la réunion des
> feuilles, sinon un jeton déclaré par le seul Skippy passerait pour déclaré et Alfred
> tournerait sans défaut. Échappatoire explicite `theme-lint-ignore: <raison>` (le viseur
> caméra n'est pas thémable). Les 4 contrôles ont été **éprouvés à l'envers** (violation
> introduite → sortie 1). Câblé dans `npm test`.

⚠️ **Dérives assumées côté Alfred** (normalisation, aucune régression fonctionnelle) : rayons
alignés sur les 8 crans (±1-2 px : `.cmd` et le textarea 15→13, `.dz-inner` 16→17, plaques
12→11, barres 3/5→4), dégradé des plaques unifié à 62 % (était 55/60/62), et `.hi` devient
`position:relative` pour tous (support du calque fantôme — sans offset, ne déplace rien).

**Déploiement (les DEUX corps, c'est le point à ne pas rater)** : tag `agent-gw-v0.45.0` →
image GHCR vérifiée au manifeste registry (`linux/amd64` + `linux/arm64`) → `alfred-helm.yml`
0.44.0 → 0.45.0 **et** `skippy-helm.yml` **0.42.0 → 0.45.0** → refresh ArgoCD forcé → pods
`alfred` 3/3 et `skippy` 2/2 Running, 0 redémarrage. Skippy avait **deux versions de retard**
(il ratait `{% graphique %}` et le lecteur de code-barres) : un bump de theme se fait sur tout
ce qui tourne sur l'image, pas seulement sur le corps qu'on regarde. Diff `0.42.0..0.45.0`
relu avant bump : **aucune variable d'env nouvelle**.
Vérifié **depuis l'extérieur et déconnecté** : sur les deux hôtes, `/` → **307** (la garde SSO
n'a pas bougé) et `/static/launcher.css` → **54 206 o** portant `--caret-display`, `--r-bub`,
`--code-inline-bg`, `--ghosttag`, `--plate-fg-tint`, `--bub-al-rule` et la règle `.md pre{`.
Côté Skippy : `GW_THEME=skippy` sur le pod et **6 occurrences de `[data-agent=skippy]`** dans
la feuille servie, avec `--r-round:2px`, `--f-title:var(--f-mono)`, `--ghosttag:"SKIPPY"`.

> 🔎 **Piège de vérification — la minification retire les guillemets des sélecteurs
> d'attribut.** Un `grep 'data-agent="skippy"'` sur le CSS **servi** rend **0** alors que le
> thème est bien là : esbuild écrit `[data-agent=skippy]`. Grepper l'attribut nu, jamais la
> forme source. (Faux négatif vécu à la vérification de la 0.45.0.)

⚠️ **Reste le seul essai qui n'a PAS été fait : le rendu, à l'œil, dans un navigateur.** Tout
ce qui précède prouve que les bons octets sont servis, pas qu'ils sont beaux. Les bulles de
Skippy, ses blocs de code, son caret et son bouton d'envoi carré demandent un coup d'œil.

**Lecteur de code-barres dans la PWA — DÉPLOYÉ (2026-07-31, agent-gw 0.44.0)** : un
bouton `▥` dans le moretray du composer, un overlay caméra plein écran, un panier de codes
qui s'accumule. **Le scanner est BÊTE, et c'est le design** : il décode, il dépose dans le
composer, il se tait. Il n'envoie rien et ne décide rien — c'est le contexte de la
conversation qui tranche ce qu'on fait du produit (fiche nutri, courses, diététique).
Corollaire : on accumule puis on dépose, donc Monsieur écrit son intention **une** fois,
scanne son panier, envoie **une** fois — ce qui tombe pile sur l'appel groupé de l'addon
`food` (rosetta 0.8.0) et sur son quota amont. Aucun module `GW_APPS`, aucune structure
mémoire neuve, aucun endpoint : `/api/chat` suffisait.

**Deux décodeurs, et le second n'est pas facultatif** : `BarcodeDetector` natif quand le
navigateur l'a (Android/Chrome), sinon `dist/scan.js` (`@zxing/library`) chargé **à la
demande**. Vérifié sur caniuse AVANT d'écrire : iOS Safari porte l'API mais
**« disabled by default » de 17.0 à 26.5**, Firefox ne l'a pas du tout — sans repli, le
bouton serait mort sur l'iPhone. Le wasm (`zxing-wasm`) écarté **après mesure** :
`@zxing/library` fait 448 Ko / **116 Ko gzip** (le tree-shaking n'y change rien, la
bibliothèque tire tous ses lecteurs), contre ~1,2 Mo de binaire à vendoriser, servir et
localiser. Moins d'infra pour le même résultat.

> 🔎 **Le 3ᵉ bundle est la seule chose qui rend le repli gratuit — et une fuite ne se
> verrait PAS.** Si `@zxing/library` remontait dans `launcher.js` (un import mal placé
> suffit), chaque chargement de page paierait 116 Ko pour une fonction que la plupart des
> sessions n'ouvrent jamais : aucune erreur, juste une PWA plus lente. Vérifié par une
> chaîne littérale qui **survit à la minification** (`ISO-8859-1`, `SHIFT_JIS`, propres
> aux tables de charset de zxing) : **2 occurrences dans `scan.js`, 0 dans `launcher.js`**.
> Ne pas grepper les noms de classes — la minification les renomme et le contrôle passerait
> au vert pour une mauvaise raison.

> ⚠️ **La liste des formats est une GARDE, pas un réglage.** EAN-8/13, UPC-A/E : des
> symbologies **numériques**. Autoriser le QR ferait entrer du **texte arbitraire** dans le
> composer d'Alfred — un autocollant hostile sur un rayon deviendrait une injection de
> prompt (D17 par la porte de service). Un scan ne peut produire que des chiffres, et un
> test le verrouille.

Détails qui mordent, tous traités : `playsinline` sur la `<video>` (sans lui iOS bascule en
lecteur natif plein écran et l'overlay passe dessous), coupure explicite des pistes à la
fermeture (sinon la caméra et sa diode restent allumées), garde de ré-entrance sur la boucle
de décodage (120 ms — une trame lente ne doit pas en empiler d'autres), dédup du panier (la
boucle relit le même code dix fois par seconde), `env(safe-area-inset-bottom)` sur la barre
d'actions. 23 tests neufs (`frontend/test/scan-test.mjs`) sur la logique pure — clé de
contrôle EAN, panier, message déposé —, **3 suites JS au vert**. Les suites Python n'ont pas
été relancées (ni `fastapi` ni `claude_agent_sdk` sur le Mac) : **aucun Python touché**, et
`/static/scan.js` tombe sous le préfixe `/static/` déjà public, donc `_PUBLIC_PATHS` ne bouge
pas (relu, pas supposé — cf. le gotcha 0.40.1 juste en dessous).
**Déployé** (tag `agent-gw-v0.44.0` → image → bump `alfred-helm.yml` → rollout ArgoCD).
Vérifié **depuis l'extérieur et déconnecté**, comme l'exige le gotcha 0.40.1 ci-dessous :
`/static/scan.js` → **200 `text/javascript`, 459 077 octets**, et `/` toujours **307** — la
garde n'a pas bougé. Côté serveur, l'addon `food` répond de bout en bout par le vrai trajet
(pod → `rosetta-bridge` → hub → OFF).

> ⚠️ **Reste le seul essai qui n'a PAS été fait : le scan lui-même, sur l'iPhone, en PWA
> installée.** Ni le décodeur de repli, ni `getUserMedia` en mode `standalone`, ni
> `playsinline` ne se vérifient depuis un Mac — tout ce qui précède prouve que les octets
> sont servis, pas qu'une caméra s'ouvre. À faire au doigt sur l'écran.

**Bloc `{% graphique %}` — livré côté code (agent-gw, non taguée)** : Alfred pouvait écrire des
chiffres, pas les montrer. Nouveau bloc au catalogue Markdoc (`frontend/src/chart.js`), dessiné
**au transform**, sans bibliothèque ni canvas ni montage JS — l'invariant « rien ne s'exécute
depuis une fiche » interdisait Chart.js/mermaid, qui auraient exigé un étage de montage.
**+4,4 ko** sur `engine.js` (Chart.js ≈ 200 ko, mermaid > 1 Mo). Corps du bloc = les données,
une paire `libellé: valeur` par ligne (paragraphe, liste à tirets ou bloc encadré → même
résultat). Quatre attributs fermés : `type` (`barres`|`ligne`), `titre`, `unite`, `couleur`
(les 12 teintes des domaines). Refus explicites à l'écran plutôt qu'un dessin faux : ligne
malformée, négatif en `barres`, courbe à un point. 33 tests (`test/chart-test.mjs`, câblé dans
`npm test`), contrat d'écriture dans `frontend/AUTHORING.md`. **À faire : la moitié cerveau**
(repo Alfred, skill `redaction` + `amelioration`) — sans elle Alfred ne saura pas que le bloc
existe. Puis tag → image → déploiement.

> 🔎 **Gotcha — une seule série, et ce n'est pas de la paresse.** Passées au validateur de
> palette, les 12 teintes **échouent** comme palette catégorielle dans les deux thèmes
> (clair : `shop`↔`achats` ΔE 7,3 *en vision normale* ; sombre : `agenda`↔`proj` ΔE 1,2 en
> protanopie). Ce sont des jetons d'**identité de domaine**, jamais montrés côte à côte. Deux
> séries y seraient indistinguables → une série par graphique, deux mesures = deux blocs.
> Ajouter des séries impose d'abord de choisir une vraie rampe catégorielle validée.

> 🔎 **Gotcha — le texte d'un SVG rétrécit avec son conteneur, et ça ne se voit pas au bureau.**
> Un `viewBox` de 660 rend ses libellés à 12,2 px dans une colonne de 820 px… et à **7,4 px sur
> un téléphone de 390** (barres à 8,3 px). Mesuré, jamais visible sur une maquette desktop.
> D'où deux techniques dans un seul bloc : **`barres` en HTML/CSS** (texte réel à taille
> constante, qui passe à la ligne au lieu de rétrécir — plus simple ET meilleur), **`ligne` en
> SVG** avec compensation par **requête de conteneur** (`container-type:inline-size` sur la
> figure). ⚠️ Les blocs `@container` doivent être écrits **après** les règles de base : une
> requête de conteneur n'ajoute **aucune spécificité**, donc une règle aussi spécifique écrite
> plus bas gagne — symptôme : la compensation semble ignorée alors que le CSS est bien là.
> ⚠️ Corollaire : toute réserve de marge calculée pour la police *nominale* rogne le texte une
> fois compensé (l'étiquette de fin sortait en `79,8 k`) → marges dimensionnées sur la **plus
> grande** taille possible, et vérifiées par `getBBox()` sur 16 combinaisons largeur × jeu de
> données, pas au jugé.

> 🔎 **Gotcha — `--window-size` ne fait PAS un viewport mobile.** Chrome headless plafonne à
> ~500 px de large sur macOS : `innerWidth` vaut 500 même avec `--window-size=390`, et la
> capture est simplement **rognée**. Une mesure « pas de débordement » prise ainsi ne prouve
> rien, et une capture peut faire croire à un bug de mise en page inexistant. Pour éprouver une
> largeur téléphone : un conteneur de largeur **imposée en CSS** dans une fenêtre plus large.

> 🔎 **Gotcha — `renderPage` filtre les erreurs d'attribut.** Markdoc classe
> `attribute-value-invalid` au niveau `error`, et `render.js` ne remonte que les `critical` :
> une valeur hors vocabulaire (`couleur="fuchsia"`) est **détectée puis jetée en silence**. La
> promesse « un attribut hors catalogue est rejeté » d'AUTHORING.md vaut pour les *noms*, pas
> pour les *valeurs* — ce qui protège vraiment est la revérification en JS avant émission.
> Vaut pour tous les blocs, pas seulement celui-ci.

> 🔎 **Gotcha — DOMPurify ne filtre pas le CSS.** Mesuré : `style="background:url(javascript:…)"`
> et `expression(…)` traversent la sanitisation intacts (inertes dans un navigateur moderne,
> mais **non filtrés**). Tout nombre qui part dans un attribut `style` n'est donc garanti que
> par son **générateur** — ici un flottant parsé passé à `toFixed`, jamais une chaîne d'origine
> mémoire. Ne jamais interpoler un libellé dans un `style`.

**Identité par skin, jusqu'au favicon — DÉPLOYÉ (2026-07-31, agent-gw 0.40.1)** : le nœud
papillon du majordome s'affichait dans l'onglet du pod de code, et deux PWA installées sur le
même téléphone portaient le même nom. Favicon et manifeste sont réclamés par le navigateur
**avant tout JavaScript** — ils ne pouvaient donc pas venir du registre côté client. D'où un
pendant serveur : un skin dépose ses actifs sous `static/skins/<id>/` (`icon.svg`,
`manifest.json`), servis par les routes `/icon.svg` et `/manifest.webmanifest` — chemin stable
dans `app.html`, contenu qui dépend de `GW_THEME`, repli sur le socle si le skin n'a rien
déposé. Le blason de l'en-tête, lui, reste côté skin (champ `crest`, en `currentColor`).
Icône Skippy en **SVG à la main** plutôt qu'en image générée : à 16 px une matricielle bave et
le sujet EST géométrique — réduite à ce qui survit (anneau ambre interrompu, cœur, quatre
graduations) au lieu des 72 de la maquette. Vérifié **depuis l'extérieur, sans session** :
`/icon.svg` 200 `image/svg+xml` 1930 o portant bien `aria-label="Skippy"` + `#F2A93B`,
manifeste 200 au nom de Skippy, `/` toujours 307 (la garde n'a pas bougé), et l'icône d'Alfred
intacte. 11 tests de plus.

> 🔎 **Gotcha — sortir un actif de `/static/` le fait retomber derrière le SSO.** `_PUBLIC_PATHS`
> liste `/static/`, pas les routes racine. En 0.40.0 le favicon répondait donc **307 vers le
> login** : page de connexion sans icône, et installateur de PWA — qui fetche l'icône du
> manifeste sans forcément joindre le cookie — bredouille. Corrigé en 0.40.1 (+ test qui pinne
> les chemins publics). ⚠️ **Ne se voit PAS depuis le pod** : en interne le middleware laisse
> passer et on lit un 200 trompeur. Tout actif public se vérifie **en externe et déconnecté**.

**Habillage déclaratif des domaines — livré côté code (agent-gw, non taguée)** : l'icône et la
couleur d'un domaine étaient une ligne d'`APP_META` dans `main.js`. Un domaine neuf (`sante`)
sortait donc en `◆` + couleur hachée jusqu'au prochain déploiement — et Alfred, qui *crée* les
domaines, devait mendier une ligne de code pour chacun. Désormais un domaine **se décrit
lui-même** dans le frontmatter de son `INDEX.md` : `titre` / `ico` / `couleur`, lus par
`metaFor` depuis `/api/memory/index` (déjà chargé, **zéro route nouvelle**, backend intact).
Précédence **champ par champ**, `APP_META` conservé en repli → aucun domaine existant ne bouge
tant qu'Alfred ne l'a pas migré. `couleur` est un **vocabulaire fermé de 12 teintes** (`rouge`
… `ardoise`) mappées sur les jetons existants, jamais un hexa : la palette est thémée
clair/sombre **et** repeinte en bloc par les skins `data-agent` (un hexa figé ignorerait les
trois), et surtout la valeur finit dans un attribut `style` — un nom hors liste est **ignoré**,
ce qui ferme l'injection depuis un contenu mémoire d'origine douteuse (D17). `ico` est échappé
(les glyphes SVG restent aux modules). L'accueil attend maintenant l'index avant de peindre
(sinon les tuiles changeraient de livrée sous le doigt) ; il part en parallèle au boot, coût
nul. Contrat documenté dans `frontend/AUTHORING.md`, 9 tests (`test/habillage_test.py`) qui
pinnent le chemin de données — s'il cassait, la panne serait **muette** (repli silencieux).
**À faire : la moitié cerveau** (repo Alfred, skill `amelioration` + décision consignée) —
étendre le contrat `redaction` et poser le frontmatter dans chaque `domaines/*/INDEX.md` ;
tant qu'elle manque, l'attribut existe mais personne ne l'écrit. Puis tag → image →
déploiement.

> ☠️ **`agent-gw-v0.38.0` EST EMPOISONNÉE — NE JAMAIS LA DÉPLOYER.** Le tag pointe sur
> `8e93c18`, c'est-à-dire la régression décrite ci-dessous *avant* son correctif : l'image a
> bien été construite et publiée sur GHCR, et elle sert une PWA morte au premier rendu.
> Correction : **0.39.0** (`f741766`), qui embarque la restauration ET l'habillage déclaratif.
> Vérifié à HEAD avant tag — sonde de mangling à 0 sur les 15 noms emportés, témoin compris,
> et les 5 suites au vert. (La note « jamais partie en image » ci-dessous était fausse : le
> tag avait été posé avant que la régression soit connue.)

**Régression rattrapée (2026-07-31, non taguée — jamais partie en image)** : l'extraction du
registre de skins (`8e93c18`) a remplacé un bloc contigu de `main.js` au lieu d'y insérer le
sien, emportant **toute la couche mémoire du lanceur** (`memInfo`/`memIndex`, `loadTree`,
`loadIndex`, `domains`, `countIn`, `isFiche`, `prettify`, `memPrefix`, `childrenOf`,
`ficheCount`, `todoStats`, l'overlay todo, `loadWorkbooks`, `labelMemLinks`, `currentRoute`).
La PWA était **morte au premier rendu** (`ReferenceError: domains is not defined`). Bloc
restauré verbatim depuis `HEAD~1`, bundle + statics refaits.

> 🔎 **Gotcha — ni `node --check` ni `esbuild --bundle` ne voient ce genre de trou.** Un
> identifiant supprimé devient une **variable libre**, syntaxiquement valable et parfaitement
> bundlable : les deux passent au vert sur un lanceur mort. Le test qui, lui, le voit —
> **les noms de haut niveau définis sont manglés par `--minify`, les libres ne le sont pas** :
> ```
> npx esbuild src/launcher/main.js --bundle --format=iife --minify --outfile=/tmp/probe.js
> grep -c "prettify" /tmp/probe.js   # 0 = défini · >0 = variable libre, donc cassé
> ```
> Contrôle indispensable : vérifier qu'un nom **connu défini** (`renderHome`) rend bien 0,
> sinon c'est le mangling qui ne s'applique pas et le test ne prouve rien.

**Pod Skippy NÉ + charte propre — DÉPLOYÉ (2026-07-31, agent-gw 0.37.0)** : second corps sur
les mêmes images, `skippy.berard.me`, 2/2 Running. Trois variables d'env nouvelles, toutes
par-pod et toutes à défaut **inerte** (Alfred ne bouge pas d'un pixel) :
`GW_APPS` (modules du lanceur, 0.35.0), `GW_THEME` (0.36.0) et `GW_TRACE` (0.37.0).
- **`GW_THEME`** : les jetons de couleur/rayon/fonte étaient codés en dur sur `:root`, donc
  partagés — le pod Skippy s'affichait en livrée de majordome. `theme-skippy.css` est une
  **surcharge de jetons scopée** par `data-agent` (posé au boot depuis `/api/version`,
  AVANT le premier rendu), importée après `launcher.css`. Aucune règle existante réécrite.
  Couvre aussi `.alfred-doc` (sinon les fiches restaient en teal). Le bouton clair/sombre
  continue de marcher : les variantes `[data-agent][data-theme]` (0,3,0) battent les
  `:root[data-theme]` d'Alfred (0,2,0).
- **`GW_TRACE`** : le flux SSE ne portait que `text`/`done`/`error`. Les `ToolUseBlock` du
  SDK sortent désormais en events `tool` — **nom + cible courte uniquement** (champ parlant
  de l'input, replié, 78 car. max) : jamais l'input complet, qui porte le fichier entier
  d'un Write ou une commande Bash potentiellement chargée. Live seulement, `/api/history`
  ne rejoue pas la trace. Off par défaut.
- Le **noyau** (canvas, indicateur de travail) remplace les trois points sous le thème
  skippy ; boucle coupée par `prefers-reduced-motion` **et** par le retrait du nœud.
15 tests (`test/apps_test.py`), moteur et planif verts, bundle + statics rebuildés.
Vérifié en prod : image `0.37.0` sur le pod, `GW_THEME=skippy GW_TRACE=1 GW_APPS=repos` dans
l'env, 12 occurrences de `data-agent` dans le `launcher.css` **servi**, `/api/health` OK,
307 vers `/auth/login` en externe avec certificat valide.
⚠️ **0.36.0 est publiée mais n'a jamais vu de cluster** (superseded par 0.37.0) — ne pas la
déployer. **Reste à valider au doigt sur l'écran : le rendu réel de la charte.**

> 🔎 **Gotcha — un `hostPath` neuf naît `root:root`.** Le pod démarrait 1/2 : la gateway
> allait très bien (elle n'écrit rien au boot) pendant que le sidecar tunnel bouclait sur
> `could not lock config file /home/agent/.gitconfig: Permission denied`. `fsGroup` ne
> corrige pas ce cas (ne s'applique pas aux hostPath). Diagnostic en une commande : comparer
> `ls -ldn <mountPath>` avec une app qui marche (`1000 1000` vs `0 0`). Fix sans SSH : un pod
> jetable busybox en `runAsUser: 0` monté sur `/mnt/data`. Détail dans `k8s-config.md` (repo
> skippy). Les apps existantes ont été chownées à leur naissance — le piège ne se manifeste
> que sur une app NEUVE.

**Modules configurables `GW_APPS` — livré côté code (agent-gw, non taguée)** : les images
se disent agent-agnostiques depuis le début, le **lanceur** ne l'était pas — routes et
tuiles `todo` / `projets` / `atelier` / `planif` / `voyages` câblées en dur sur le monde
d'Alfred. Un second corps (pod Skippy, cf. `SKIPPY-POD.md`) y aurait affiché des tuiles de
menuiserie. Désormais `GW_APPS` liste les modules du pod, `/api/version` les publie, le
lanceur les lit **au boot** (avant le premier rendu, sinon on voit passer les tuiles du
repli) et masque **la tuile ET la route** — une URL en marque-page ne ressuscite pas un
module éteint. La mémoire (fiches, domaines) n'est pas un module : socle commun, toujours
là. Effets de bord voulus : module Voyages éteint → `#/dom/voyages` redevient un domaine
ordinaire ; module Atelier éteint → `diy` réapparaît dans les domaines au lieu de
disparaître ; rangée « Transverse » masquée si vide ; les enrichissements de tuiles
(todoStats, `/api/planif`, voyages) ne partent plus en réseau pour des tuiles absentes.
Défaut = jeu historique, **Alfred ne bouge pas**. Tests `test/apps_test.py` (défaut, liste
explicite, rognage, vide, payload `/api/version`), planif toujours vert, bundle + statics
rebuildés. **À faire : tag → image → déploiement.**

**Tâches planifiées — DÉPLOYÉ (2026-07-29, agent-gw 0.34.1)** : Alfred n'avait aucun
déclencheur temporel ; la consolidation des gestes (todo/voyage), le push mémoire du soir
et la « une » du matin attendaient qu'on lui ouvre une session. Nouveau module
`app/planif.py` : une boucle asyncio lit `memory/planif/*.md` (fiches `type: planif`, en
git, écrites par Alfred seul) et ouvre à l'heure dite un tour ordinaire avec **le corps de
la fiche pour prompt** — session neuve, `_query_lock` partagé, journal dans
`planif/planif-state.json` (hors git). Cron maison 5 champs : on **matche la minute locale**
au lieu de calculer une prochaine échéance en UTC — DST correct sans arithmétique de fuseau,
et « pas de rattrapage » vient gratuitement (fenêtre de grâce 5 min, une occurrence, jamais
la file). Plancher de fréquence 15 min : un cron plus fin rend la fiche **invalide** au lieu
d'être lissé en silence. Garde : `GW_CHANNEL=planif` injecté via `ClaudeAgentOptions.env`
(vérifié sur le pod : le SDK **fusionne** ce dict sur l'env hérité, le token OAuth survit) →
`google_guard.py` ferme **toute** la surface Google sur ce canal, lectures comprises — pas
seulement à cause du bouclier inarmable, mais contre le **blanchiment** (mail hostile lu sans
témoin → résumé dans memory/ → relu comme fiable au tour suivant). Onglet PWA `#/planif` en
**lecture** (créer/suspendre = message à Alfred). Le prompt porte un **cadre de provenance**
(patron `ask_alfred`) : sans lui l'agent ne peut pas *savoir* qu'il est dans un tour planifié
— la discipline lui dit comment s'y comporter, pas qu'il y est ; le corps de la fiche passe
mot pour mot en dessous. Cerveau : **D30** + **F8** (repo Alfred), qui amende la seule ligne
« aucun déclencheur temporel » de D8 — le contrat « Alfred n'écrit jamais de lui-même »
tient : palier 1 = tâches **muettes**. 47 tests verts (`test/planif_test.py`), hook testé sur
les 3 canaux, `node --check` + bundle + statics OK. ⚠️ **0.34.0 est publiée mais périmée**
(taguée avant le cadre de provenance) : déployer **0.34.1**, jamais 0.34.0.
Déploiement : tag `agent-gw-v0.34.1` → image GHCR multi-arch vérifiée au manifest registry →
`alfred-helm.yml` 0.33.2 → 0.34.1 → refresh ArgoCD forcé → pod 3/3 Running en 0.34.1,
`/api/planif` présent dans `app.openapi()`. **E2E prouvé en prod** : fiche temporaire calée à
`00:11`, tour parti à `00:11:08` (tick de 30 s), 3,7 s, réponse conforme, journal écrit —
fiche et entrée de journal retirées derrière. Garde rejouée **sur le pod** : canal `planif` →
`exit 2` sur `mail_search` / `calendar_events` / `mail_draft` / `calendar_create` ; canal
`pwa` inchangé (lectures et brouillon passent, `calendar_update` réclame le bouclier).

> 🔎 **Gotcha de déploiement — le hook ne voyage PAS dans l'image.** `google_guard.py` vit
> dans le **workspace** (repo Alfred, monté sur le PVC), pas dans `agent-gw`. Au moment du
> déploiement, le pod était encore sur un commit antérieur : l'image portait le canal
> `planif`, **le coupe-circuit n'était pas là**. Une fenêtre où des tours planifiés
> auraient pu atteindre Google. → **Livrer une garde = deux gestes** : publier l'image ET
> `memory-sync pull` dans le pod. Vérifier avec un `grep` sur le fichier réel du workspace,
> jamais en supposant que « c'est poussé sur origin donc c'est actif ».

> 🔎 **Gotcha de vérification — « la route est-elle servie ? » ne se prouve PAS par un 401.**
> Le middleware d'auth d'agent-gw s'exécute **avant** le routage : `/api/nexistepas` répond
> `401` exactement comme `/api/planif` (mesuré sur le pod, 2026-07-29). Le test utilisé pour
> 0.33.0 était donc un faux positif. Ne marche pas non plus : parcourir `app.routes` — les
> routeurs montés par `include_router` y apparaissent en `_IncludedRouter` sans `.path`, si
> bien que `/api/voyage/*` semble absent alors qu'il tourne. **Le seul test concluant depuis
> le pod :**
> `python -c "from app.main import app; print(sorted(app.openapi()['paths']))"`.

**⚠️ Fausse piste à ne PAS refaire — approbation MCP (2026-07-28).** Une indispo du serveur
**ghost** s'était déguisée en problème d'approbation des serveurs MCP, d'où une piste
`claude-flag-settings.json` (`enableAllProjectMcpServers: true` copié dans l'image et passé
au SDK par `--settings`). **Inutile** : root cause trouvée ailleurs, et mesuré sur le pod en
0.33.0 — `hasTrustDialogAccepted: false` et `enabledMcpjsonServers: []` dans `~/.claude.json`,
et pourtant Alfred appelle bel et bien `mcp__google__*` / `mcp__transit__*`. Les MCP du
`/workspace/.mcp.json` chargent **sans** trust ni pré-approbation. Piste abandonnée, fichier
et hunk Dockerfile supprimés. → Si les outils MCP disparaissent un jour, suspecter le serveur
en amont, pas l'approbation.

**Cocher une tâche = un geste — DÉPLOYÉ (2026-07-28, agent-gw 0.33.0)** : la case de la
vue todo ne cochait rien, elle **pré-remplissait la zone de saisie** (« Marque la tâche
« … » comme faite. ») qu'il fallait envoyer soi-même — un aller-retour LLM pour un booléen.
Désormais `GET|POST /api/todo/state` écrit un overlay `todo/todo-state.json` (hors git,
comme workbook/voyage), le front le superpose à `/api/memory/index` (l'overlay gagne) et le
clic est **optimiste** : bascule immédiate, POST direct, révocation si le réseau tombe.
Décochage géré (l'overlay porte 3 états : date ISO / `false` / absent, la fiche pouvant
déjà dire `done:` depuis une consolidation). Alfred consolide le `done:` dans les fiches à
son passage suivant, **en gardant la date du geste**. Retirer d'une liste / supprimer une
liste restent des messages à Alfred (curation = jugement). Cerveau : **D28** (repo Alfred),
qui renverse partiellement D27. Endpoint testé (TestClient : coche, décoche, merge,
persistance, 400 sans clé) ; bundle + statics rebuildés, tests moteur verts, `node --check`
OK. Tag `agent-gw-v0.33.0` → image GHCR multi-arch (amd64+arm64) vérifiée au manifest
registry → `alfred-helm.yml` bumpé 0.32.0 → 0.33.0 → refresh ArgoCD forcé → pod alfred
3/3 Running, image `agent-gw:0.33.0` confirmée, `/api/todo/state` répond **401** (~~route
servie et gardée — un 404 aurait signé une image sans le code~~ ⚠️ **raisonnement FAUX**,
cf. l'entrée planif : le middleware d'auth passe AVANT le routage, une route inexistante
répond 401 elle aussi). **Reste à valider au doigt sur l'écran : la bascule optimiste dans
un vrai navigateur.**

⚠️ Les entrées « non taguée » plus bas (UI mobile, pièces jointes) sont **périmées** :
elles ont été taguées et déployées depuis (0.30.0 → 0.32.0) sans que ce fichier soit
repassé dessus. À nettoyer au prochain passage.

**File d'attente — rattrapage groupé — DÉPLOYÉ (2026-07-23, agent-gw 0.29.0)** : les
messages tapés pendant qu'Alfred travaille étaient rejoués **un par un** (un tour par
message) ; désormais ils sont **fusionnés en un seul tour** au prochain passage — textes
recollés en paragraphes (ordre préservé), pièces jointes concaténées. Modif client-only, un
point : sortie de file dans `sendMessage` (`queue.shift` → `queue.splice(0)` + merge),
`frontend/src/launcher/main.js`. Tag `agent-gw-v0.29.0` → image GHCR multi-arch OK →
`alfred-helm.yml` bumpé 0.28.0 → 0.29.0 → pod alfred 3/3 Running vérifié.

**UI mobile — 3 retouches livrées côté code (agent-gw, non taguée)** :
1. **Composer replié** : les 3 actions (🛡 ⚡ 📎) passent sous un « + » en mobile
   (popover `.moretray` ; desktop inchangé via `display:contents`), pastille sur le
   « + » quand bouclier ou éphémère est armé. Fichiers : `app.html`, `launcher.css`,
   `launcher/main.js` (bloc Feature 1).
2. **Zoom bridé** : viewport `maximum-scale=1, user-scalable=no` (honoré par iOS en
   PWA standalone) + `touch-action:manipulation` (coupe le double-tap-zoom) + textarea
   `16px` en mobile (coupe le zoom au focus iOS). La coque était déjà verrouillée
   (100dvh, seule `.stream` scrolle) → « je perds header/barre » venait du zoom de
   page, pas du layout.
3. **Swipe deux-écrans** : `#shell` devient une piste 200vw ; swipe horizontal (suivi
   du doigt + calage à 28 %) bascule chat ⇆ apps, poignées de bord (`.edge`) en
   affordance/repli. Mobile seul (`max-width:820px`, aligné JS/CSS) ; desktop garde le
   rail redimensionnable. **Chat = écran par défaut** (route vide ramène au chat ;
   naviguer vers une app ouvre l'écran apps) ; le swipe/les poignées basculent en plus.
   Bundle + statics rebuildés (esbuild), tests moteur verts, `node --check` OK.
   **À faire : tag → image → bump manifeste k8s pour déployer + test sur téléphone.**

**État :** **vue Todo réécrite côté code (agent-gw, non taguée)** :
`renderTodo`/`todoStats`/`renderList` consomment `/api/memory/index` — fini le parseur de cases
à cocher de `taches.md` (qui avait vidé l'écran après la migration des todos au format fiche).
Base unique `type: tache`, **listes curées `type: liste` (refs)** + vues dynamiques calculées
(retard / rapides / bloquées / base), sous-tâches `sub:`, non-duplication rendue visible
(pastilles « dans quelles listes »). Gestes (cocher, retirer, créer/supprimer une liste) =
messages à Alfred, **jamais d'écriture** (frontière workbook/voyages). Contrat `type: liste`
côté cerveau (**D27**, repo Alfred). Bundle + statics à jour, tests moteur verts, modèle vérifié
sur données réelles. **À faire : tag → image → déploiement** (embarque aussi les pièces jointes
ci-dessous).

**État (pièces jointes) :** **livrées côté code (agent-gw, non taguée)** : bouton 📎
(+ appareil photo) + glisser-déposer + coller ; `POST /api/upload` pose les fichiers dans
`GW_STATE_DIR/inbox/` (hors repo mémoire, purge TTL), `/api/chat` les résout (garde
anti-traversée) et préfixe le prompt d'une note anti-injection (D17) — Alfred les lit via
son outil `Read`. Front rebuildé (bundle + statics à jour). **À faire : tag `agent-gw-v0.21.0`
→ image → bump du manifeste k8s.** Voir plus bas.

**Fix buffer image jointe — DÉPLOYÉ (2026-07-21, agent-gw 0.22.1)** : lire une vraie
photo via `Read` faisait « JSON message exceeded maximum buffer size of 1048576 bytes » —
le SDK inline l'image en base64 dans UN message stream-json, et son buffer stdout par
défaut est 1 Mo. `ClaudeAgentOptions(max_buffer_size=…)` posé sur les **deux** appels
`query`, dimensionné sur `MAX_UPLOAD_BYTES × 2` (override `GW_MAX_BUFFER_MB`) ; plancher
SDK relevé à `>=0.2.124` (version où le champ est vérifié). Tag `agent-gw-v0.22.1` →
image GHCR OK → `alfred-helm.yml` bumpé 0.22.0 → 0.22.1 → pod alfred 3/3 Running vérifié.

**État (précédent) :** **rosetta-bridge livré dans les deux images** (claude-pod 0.4.0, agent-gw
0.20.0) : relais stdio→HTTP vers le hub `rosetta.mcp.berard.me` (repo rosetta-mcp, EN
PROD sur tantive — maps + transit, clés d'API côté serveur), refresh de token
client_credentials (`agent-alfred`) intégré, stdlib seule — testé e2e en conteneur
Linux contre la prod. Les `mcp_servers/` d'agent-gw sont DEPRECATED (retrait + purge
des clés de l'env après bascule vérifiée). ⚠️ Le pod tourne en agent-gw 0.18.0 :
0.19.0 (économie de contexte : TTL session, pastille poids, menu Sujets, mode
éphémère ⚡, Réglages ⚙) est taguée mais jamais déployée → déployer 0.20.0 l'embarque.
Avant : alfred-voice 0.1.0 déployé ; module Voyages livré (spec `VOYAGES.md`).

**Bascule rosetta FAITE (2026-07-20)** : pod alfred en agent-gw 0.20.0 + claude-pod
0.4.0, identité `agent-alfred` via coffre (`oidc/agent-alfred`, externalSecrets
data + groups.tunnel), `.mcp.json` → rosetta-bridge (repo + /workspace du pod),
bridge vérifié in situ dans le conteneur tunnel (initialize → serverInfo maps).

**DÉPLOYÉ (2026-07-20)** : Authelia client alfred enrichi (offline_access,
audience rosetta, RS256, consent implicit), pod alfred en 0.21.0/0.5.0,
`.mcp.json` google → rosetta-bridge (repo + pod). E2E EN ATTENTE : re-login PWA
(semer le refresh token) puis test Gmail — si « aucun compte enrôlé pour
<uuid> » : ajouter une claims_policy Authelia (preferred_username dans
l'access token). Avenant skill correspondance = côté cerveau.

**Prochaines étapes :**
- [ ] **Pod Skippy** (`SKIPPY-POD.md`) — design validé, `GW_APPS` posé, question CI
      tranchée (un token d'App déclenche bien les workflows → `actions_run` retiré de
      la surface). Prochain geste, **côté navigateur** : créer la GitHub App. Puis
      addon `github` dans rosetta-mcp, `github_guard.py`, vue `repos`, repo cockpit,
      `skippy-helm.yml`.
- [ ] **Tâches planifiées** : reste à voir de ses yeux l'onglet `#/planif` dans un vrai
      navigateur (vide aujourd'hui — Alfred n'a pas encore posé de fiche). La première sera
      la consolidation de `todo-state.json`.
- [ ] **UI mobile (3 retouches)** : taguer une nouvelle `agent-gw-vX.Y.Z` → image CI →
      bumper `image.tag` dans `alfred-helm.yml` (k8s-home-lab) → ArgoCD. Tester sur
      téléphone : le « + » (+ pastille), l'absence de zoom involontaire, le swipe chat⇆apps.
- [ ] **Pièces jointes** : taguer `agent-gw-v0.21.0` (CI build l'image) puis bumper `image.tag`
      dans `alfred-helm.yml` (k8s-home-lab) → ArgoCD déploie. Tester en prod : 📎 sur mobile,
      drop + coller sur desktop, un envoi fichiers-seuls, un PDF lu par Alfred.
- [ ] Après quelques jours de bascule sans accroc : agent-gw 0.22.0 sans `mcp_servers/`, retirer
      GOOGLE_MAPS/SNCF/IDFM de `externalSecrets.data` d'alfred-helm.yml
- [ ] **Rosetta / Google** : scoper le MCP Google en SOUS-AGENT `correspondance`
      (`AgentDefinition.mcpServers`) pour sortir ~6-9k du socle des tours ordinaires —
      CONDITIONNÉ à la vérif que le hook `google_guard` et le bouclier 🛡 se
      déclenchent bien dans un sous-agent (D17/D24). Cf. DECISIONS.md (repo Alfred).
- [ ] agent-gw : proxy `/api/voice/*` → alfred-voice + page Réglages → Vocal (devices,
      services Wyoming, voix par route avec préécoute)
- [ ] Test d'intégration sur un Voice PE (désactiver son entité `assist_satellite`
      dans HA d'abord) ; ajuster VAD/timeouts ; voix « alfred » à ajouter dans
      nestor-voice
- [ ] Côté cerveau (repo Alfred) : décision **D31** (canal vocal) + registre vocal.
      ⚠️ Le numéro a glissé deux fois le 2026-07-28 : D28 = overlay des gestes todo,
      D29 = brouillon corrigeable / allowlist rosetta, D30 = tâches planifiées. Le vocal
      prendra le prochain numéro libre — vérifier `DECISIONS.md` avant d'écrire, pas ce
      fichier.
