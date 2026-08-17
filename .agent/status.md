# Status — agent-pods

> MàJ : 2026-08-17

**Le demi-millimètre des cotes de scène (0.67.0, 2026-08-17)** : `sceneSVG` arrondissait les
cotes mesurées au millimètre entier — la colonne de 331,5 du meuble imp3d affichait
« 332 mm ». Mesure au 0,5 près désormais, virgule française. Déclencheur : la première
VRAIE scène du contrat ouvert, écrite ce jour pour imp3d (élévation de face, cotes ancrées,
séquence 8 étapes) — dans la mémoire d'Alfred, commit `memoire:`, pas dans cette image.
0.66.0 (élévation héritée assagie) n'a jamais été épinglée : on déploie direct en 0.67.0.

**L'élévation héritée cesse de faire du dessin d'art (0.66.0, 2026-08-17)** : signalement de
Monsieur sur l'Assemblage du workbook imp3d — « des trucs très étranges ». Trois défauts du
chemin élévation (assemblage sans scène ouverte) : le viewBox se dimensionnait sur le côté du
module (721 mm → ~288 px) puis s'étirait pleine carte, ×3, traits gras et chiffres géants —
le garage (côté 1920) ne l'avait jamais montré ; les cotes proches (702/721) s'imprimaient
l'une sur l'autre ; et les `note` des niveaux — tout le contenu qu'Alfred avait écrit, sans
`connecteurs` — étaient jetées. Correctifs : **plafond d'étirement ×2 du naturel** (même
règle pour toutes les cartes de la vue, W commun ⇒ px/mm commun — la cohérence interne
tient), **cotes étagées sur deux rangs** quand elles se touchent, **notes de niveaux
rendues** sous le dessin (`h — note`), et les libellés de connecteurs vides ne s'émettent
plus. Vérifié à l'œil sur imp3d monté en local. Le vrai remède reste côté auteur : la scène
du contrat ouvert existe pour dessiner un VRAI montage — l'élévation héritée n'est que la
béquille des assemblages sans scène.

**Lamello en MULTI-VUES — le champ `sur` dit la surface fraisée (0.65.0, 2026-08-17)** :
demande de Monsieur — des fentes tantôt sur une face, tantôt dans un chant, tantôt de part
et d'autre, et une seule vue à plat qui ne sait pas le montrer. Une prépa lamello gagne
**`sur`** (vocabulaire fermé : `face` · `contre-face` · `abouts` · `rive-avant` ·
`rive-arriere`) ; dès qu'une pièce en déclare un, sa carte passe en **fiche multi-vues** :
la face au centre, chaque surface fendue **rabattue** en projection alignée (bandes d'about
à g./d. — `abouts[]` choisit le bout —, rives dessus/dessous, contre-face en dessous **par
transparence**, même orientation donc mêmes cotes). **Tout à l'échelle commune, jamais de
zoom local** (principe imposé par Monsieur : un plan se vérifie parce que tout s'y mesure
pareil) — le viewBox garde une largeur commune avec réserve latérale GLOBALE pour les
bandes ; dans une bande d'épaisseur la fente est un **trait d'axe**, la vérité est dans les
cotes écrites, partagées entre les vues alignées. Une prépa sans `sur` garde la carte à
plat historique (les deux régimes cohabitent, migration au fil de l'eau). Fiche pièce :
`(sur …)` dans les préparations. Contrat + validateur à jour. Vérifié à l'œil : LAME
(abouts seuls, face nue), SEMELLE (face + contre-face démo, cotes partagées 10·128·246·364…),
LISSE (face), et le livre sans `sur` rend comme avant. C'est ce chantier que la remarque
« on fait des plans, pas du dessin d'art » a cadré : l'idée initiale d'un zoom local sur
les abouts est morte, et c'est tant mieux.

**Les CHANTS, enfin lus — `chants[]` remplace `couleur` (0.64.0, 2026-08-17)** : troisième
lecture, la bonne, confirmée par Monsieur — « pas tout le contour, uniquement le côté avec
un chant ». Sa demande d'origine (« les cotes avec des champs ») disait « les CÔTÉS avec des
CHANTS » : les bords qui passent à la plaqueuse. Le champ `couleur` de 0.61.0–0.63.0 (mon
invention, jamais déployée ni utilisée par un workbook réel) est **retiré** ; à la place,
**`chants[]` au catalogue de la pièce** — vocabulaire fermé `avant · arriere · gauche ·
droite · abouts`, repère du dessin Tronçons (longueur en x, avant en haut). La vue Tronçons
surligne **ces seuls côtés** en trait orange épais (`--warn`) sur l'arête, la fiche pièce et
la fiche colonne les annoncent, et les chants entrent dans la signature de regroupement des
colonnes (au poste de plaquage, deux colonnes aux chants différents ne sont pas jumelles).
La vue Débit ne les dessine pas : ses colonnes tournent les pièces (`sens`, `rot`), le
repère avant/arrière n'y est plus fiable. La **légende** de Tronçons (ajoutée en 0.63.0)
reste, avec l'entrée « côté plaqué (chant) ». Vérifié à l'œil : 5 arêtes orange sur le
claustra d'essai (avant seul, avant+abouts, arrière seul), zéro contour entier, fiche pièce
« Chants : avant · abouts ». Embarque 0.62.0 (stations déclarées) et 0.63.0 (légendes),
jamais déployées — un seul bump de manifestes, direct en 0.64.0.

**`couleur` marque le BORD, pas la cote — correctif de lecture (0.63.0, 2026-08-17)** :
retour de Monsieur sur la 0.61.0 — « je veux que le bord de la forme ayant un champ soit
représenté dans une couleur bien visible, pas la mesure ». La 0.61.0 teintait la cote ;
j'avais mal lu. Désormais le champ `couleur` d'une pose teinte le **contour de la forme**,
épais (2.5) et pleine opacité — le tronçon dans la vue Tronçons, la pièce dans la vue Débit
(éteint une fois débitée) — et un **point coloré** dans la fiche colonne ; les cotes restent
à l'encre. Le contrat conseille une teinte qui tranche avec la sarcelle du bord normal
(`orange`, `rouge`, `violet` — pas `emeraude`). Et la vue **Tronçons gagne sa légende** en
pied de page (même pied que Plaques), la légende de Plaques mentionne le bord marqué.
Vérifié à l'œil : bords teintés sur les trois pièces marquées, zéro cote teintée au DOM,
légendes présentes. Livré avec les stations déclarées de 0.62.0 dans un seul déploiement.

**Workbook — la barre de stations se déclare (0.62.0, 2026-08-17)** : demande de Monsieur —
la barre `Plaques → Tronçons → … → Suivi` était codée en dur ; il la veut dynamique, chaque
type **zéro ou plusieurs fois**, dans l'ordre du vrai atelier. Nouveau champ racine optionnel
**`stations[]`** : `{type, titre?, plaques?|modules?}` — vocabulaire fermé des six types,
`titre` pour distinguer les doublons (« Tronçons CP » / « Tronçons MDF »), portée `plaques`
sur debit/tronconnage et `modules` sur rainure/lamello/assemblage (une scène sans `module`
n'apparaît que dans une station non scopée — on ne devine pas). `wbTab` passe de type à
**index**, remis à zéro au changement de livre. **Sans `stations[]`** : barre dérivée —
l'ordre historique **moins les stations sans contenu** (le claustra perd son onglet Rainures
vide). La progression d'en-tête et le Mode atelier ne bougent pas (étapes du débit). Contrat
dans `atelier:workbook-json`, validateur du workspace étendu (types, portées, références).
Vérifié à l'œil : montage local, barre déclarée avec Tronçons en double (« Tronçons lames » /
« Structure ») + barre dérivée du claustra d'origine, captures + dump des onglets.

**Workbook — cotes mises en évidence par `couleur` (0.61.0, 2026-08-17)** : demande de
Monsieur — pouvoir afficher certaines cotes dans une autre couleur, au premier chef à
l'étape Tronçons. Une pose de tronçonnage gagne un champ **`couleur`** optionnel, le
**même vocabulaire fermé que les fiches** (les douze teintes, résolues par `HUES` → jetons
d'app thémés clair/sombre ; jamais d'hexa, hors liste → repli encre sourde). Effet : la
cote de longueur teintée et graissée dans la vue **Tronçons**, la cote sous le nom dans la
vue **Débit** (sauf pièce débitée — le signal a servi), la longueur dans la fiche colonne.
La couleur entre dans la **signature de regroupement** : une colonne marquée ne se fond pas
dans ses jumelles non marquées. Purement visuel, le front n'en déduit rien — le pourquoi du
marquage vit dans la fiche projet. Contrat documenté dans `atelier:workbook-json` ;
validateur du workspace d'Alfred mis à jour (contrôle du vocabulaire). Vérifié à l'œil
(leçon 0.52.0) : PWA montée en local sur un claustra patché de trois teintes, captures
headless des deux vues + dump DOM du popup colonne. Au passage, le bundle commité
`app/static/launcher.js` est **rebuildé depuis les sources** : il rattrape le skin nestor
de 0.60.0, que le pod avait livré en source sans pouvoir builder.

**Le skin `nestor` existe enfin — ÉCRIT ET VALIDÉ AU BANC, PAS ENCORE PUBLIÉ (2026-08-16)** :
constat de Monsieur devant sa PWA — « le déploiement de Nestor n'embarque pas son thème, le
logo et le style sont ceux d'Alfred ». Exact, et ce n'était pas une panne de déploiement :
`nestor-helm.yml` posait bien `GW_THEME=nestor` depuis le premier jour, mais **aucun skin de
ce nom n'était livré par l'image** — le commentaire du manifeste l'annonçait lui-même. Un
thème inconnu retombe proprement sur le socle : PWA fonctionnelle, au nom et à l'icône
d'Alfred. Cinq fichiers, exactement les trois gestes du contrat (`skins/index.js`) plus les
deux actifs serveur :

- `skins/nestor.js` — fabrique : blason, invite, `busyNode` (le lapin, ventre qui pulse) et
  l'accueil. Les tracés sortent de la police « Nestor » ; le glyphe complet étant la
  **concaténation** du corps et de ses trous, il n'est pas embarqué deux fois.
- `skins/nestor.css` — jetons des deux heures. ⚠️ Structure du **socle**, pas celle de
  `skippy.css` : le jour est le bloc de base et la nuit vit dans `@media
  (prefers-color-scheme:dark)`, donc ce corps **suit le réglage du téléphone**. C'est
  délibéré — la famille n'a pas à chercher un bouton.
- `skins/index.js` + `skins/themes.css` — une ligne chacun.
- `static/skins/nestor/{icon.svg,manifest.json}` — les actifs que le navigateur réclame
  AVANT tout JavaScript. Sans eux, l'icône d'écran d'accueil resterait celle d'Alfred même
  avec le reste en place, et les trois corps seraient indiscernables sur un même téléphone.

**Contrastes mesurés, pas jugés à l'œil** : l'améthyste actée (#8B6CE8) tombe à 3,4:1 sur la
porcelaine — elle descend à #6B4BC8 le jour, même teinte. Les aplats de bulle prennent
l'améthyste profonde dans les deux heures (texte à 6,1:1) ; l'accent reste la lumière.

**Banc** : `theme-lint` passe (le contrat de thème est respecté — déclaration pure, aucune
règle qui repeindrait Alfred), `npm test` 30/30 + 9/9, build esbuild OK, `apps_test.py` 71/71.
Le contrôle des actifs de skin **balayait `skippy` en dur** : il est passé au balayage de tout
dossier livré sous `static/skins/`, et compare désormais au FICHIER manifeste du skin plutôt
qu'à des valeurs recopiées. Ajouter un quatrième corps ne réclamera rien ici.
Au passage, `load()` d'`apps_test.py` neutralise `GW_FEATURES` et `GW_THEME` : le cas
`/api/version` comparant le dict entier, il lisait l'environnement du pod et **échouait sur
tout corps réel** — banc rouge sans qu'aucun code soit en cause.

⚠️ **Défaut connu, signalé par Monsieur et assumé pour ce jalon** : en position **horizontale**,
les oreilles ne sont pas collées au corps. Le masque `hors-cloche` tourne AVEC l'oreille (il est
posé sur le `<g>` interne du SVG qui subit la rotation), donc sa découpe cesse de coïncider avec
le dôme dès que l'angle s'éloigne de la verticale — d'où un jour entre l'oreille et le crâne.
Piste : masquer dans un repère FIXE (masque appliqué en dehors du transform, ou `mask` en
`objectBoundingBox` sur un calque parent non tourné). Décision de Monsieur : **on déploie en
l'état, on retravaille l'animation ensuite**.

**Reste à faire** : release de l'image (geste de Monsieur), puis bump du tag dans
`nestor-helm.yml`. Les manifestes d'alfred et skippy épinglent la même image et suivront à leur
rythme — le skin est **inerte** chez eux tant que `data-agent` ne vaut pas `nestor`.

> ↳ **0.59.1 (2026-08-11)** : le hub Voyages avait échappé au tiroir — c'est un module
> (`renderVoyagesHub`, `voyage.json`), pas une vue domaine. Même règle, même `<details>` :
> un voyage `clos` file à l'Archive. **Le tri se fait sur le statut DÉCLARÉ, jamais sur les
> dates** — une `fin` passée n'archive pas un voyage encore en consolidation ; c'est la
> clôture qui range (constaté : baden `en-cours` et brocéliande `prépa` avec dates passées
> restent en grille tant qu'Alfred ne les clôt pas). Vérifié à l'œil sur montage local.

**Les cartes archivées sortent de la grille — PUBLIÉE ET DÉPLOYÉE en 0.59.0 (2026-08-11)** :
image GHCR vérifiée au manifeste registre (index OCI amd64 + arm64) AVANT le bump, les **TROIS**
manifestes bumpés (alfred, skippy, **nestor** — lui aussi épingle l'image), et `launcher.js`
servi par alfred ET skippy au SHA-256 exact du build local (`a4a8dcef…`). Demande de
Monsieur — les fiches au cycle terminé s'affichaient au milieu des vivantes. Dans la vue
domaine (`renderDomain`), un statut **terminal** (`clos` et ses synonymes tolérés ; `offert` ;
`acheté` sur un `achat` — un cadeau acheté reste à offrir, donc vivant) range désormais la
carte dans une section **Archive** (`<details>` replié, ouvert d'office quand il n'y a QU'elle).
La recherche fouille l'archive, les facettes non (elles décrivent les vivantes — `clos` ne
pollue plus les pastilles de filtre). La vue par catégories compte séparément :
« n projets · m archivés ». `sc()` gagne `réalisé → clos` (statut hors vocabulaire constaté sur
le claustra). Doc synchronisée : `fiches-format/SKILL.md` + `AUTHORING.md` disent qu'on
n'invente **jamais** de statut « archivé » ni de dossier d'archive — le statut fermé suffit,
l'UI fait le rangement. `sujets/archive/`, lui, reste invisible (autre régime, décision
inchangée). **Vérifié à l'œil** (leçon 0.52.0) : PWA montée en local sur une copie de la
mémoire, captures headless des deux vues + dump du DOM du tiroir — les 2 fiches terminées de
Menuiserie y sont, pastilles justes.

**`git-credential-rosetta` — le pod pourra enfin publier son propre travail (2026-08-10,
ÉCRIT, PAS PUBLIÉ)** : Skippy savait écrire du code et pas le livrer. `repo_commit` passe les
**contenus en ligne** dans l'appel d'outil — publier 0.57.2 lui demandait de retaper 186 Ko de
mémoire, dont un `main.py` de 72 Ko. Il a refusé, à raison ; c'est un humain qui a fini par
sortir ses commits du pod en `git bundle`.

Le hub gagne un proxy git smart-HTTP (**rosetta 0.14.0**, addon `git`) : le pod pousse du vrai
git, le hub relaie vers GitHub avec le jeton de l'App, et **le credential GitHub ne quitte
jamais le hub**. L'invariant que `repo_commit` protégeait est intact ; son coût disparaît.

**Ce helper est la moitié qui vit ici, et c'est celle qui décide.** Un `git push` est une
commande shell : le hook PreToolUse du workspace ne voit que des appels MCP, donc il ne le voit
pas — et un en-tête portant le canal serait forgeable par le shell qu'on prétend garder. Le
credential helper n'a ni l'une ni l'autre faiblesse : **il est la seule source du jeton**, donc
un agent qui le contourne ne contourne pas une garde, il se retrouve sans rien à pousser.
Sémantique identique à `google_guard.py`, même env, même endpoint de bouclier, même
fail-closed : canal absent (VS Code) → servi ; `planif` → refus sec ; autre (PWA) → **un
bouclier consommé par push**.

⚠️ **Le défaut qui aurait rendu tout ça inerte : git ne sait PAS envoyer un `Bearer`.** Un
credential helper lui rend un couple utilisateur/mot de passe, jamais un en-tête — le hub aurait
répondu 401 à chaque push. D'où, côté rosetta, l'acceptation du **Basic comme enveloppe du même
JWT** (convention `x-access-token` de GitHub) : l'enveloppe s'élargit, pas la confiance.

**Éprouvé avec git lui-même**, pas seulement au shell : `git credential fill` invoque bien le
helper et lit ses credentials ; en `planif` il n'obtient rien et échoue proprement sur
`terminal prompts disabled` au lieu de pendre sur un prompt. D'où `GIT_TERMINAL_PROMPT=0`, qui
doit accompagner le câblage.

**Reste à faire :**
- [ ] Publier **rosetta 0.14.0** (tag → image GHCR multi-arch **vérifiée avant le bump** →
      `clusters/tantive/home/mcp/rosetta-mcp-helm.yml`). Aucun secret, aucun ExternalSecret,
      aucune route d'ingress neuve
- [ ] Publier **agent-gw 0.58.0** (ce helper) et bumper **les DEUX** manifestes
- [ ] Câbler, par dépôt du pod — deux commandes, rien de plus :

      ```
      git config credential.https://rosetta.mcp.berard.me.helper rosetta
      git remote set-url origin https://rosetta.mcp.berard.me/git/AntorFr/<repo>
      ```
- [ ] **e2e réel sur un dépôt sans conséquence AVANT de basculer les remotes des pods** :
      c'est la première fois qu'un push traverse la chaîne entière
- [ ] Une fois éprouvé : côté Alfred, **D46 se rediscute** — elle est adossée à ce manque précis

**0.57.2 — PUBLIÉE ET DÉPLOYÉE (2026-08-09/10)** : `ClaudeAgentOptions`
est construit à **deux** endroits et un seul recevait `claude_token.stored_env()`.
`_run_alfred` (MCP, planif) l'avait depuis le début ; le handler `chat` passait `env=turn_env`
nu. **Le seul chemin pour lequel la modale « Connexion Claude » a été écrite était le seul
qu'elle ne réparait pas** — `main.py:1467`, une ligne.

- **Mesuré, pas déduit** (2026-08-09, sur Alfred) : flux `claude-token` déroulé jusqu'au bout,
  MCP et planif repartis, chat toujours en `OAuth session expired`. Il a fallu reconstruire
  `~/.claude/.credentials.json` à la main — un montage qui retombe au premier refresh raté.
- **Ce que ça répare vraiment.** Le `refreshToken` d'une session Claude a une **échéance
  absolue d'environ 30 jours depuis le login initial**, que les rafraîchissements ne repoussent
  pas. Sans ce correctif, chaque corps redevient muet tous les ~30 jours et le flux PWA ne peut
  pas l'en sortir. Le mur de Skippy : **2026-08-27 22:12**.
- **Ordre de merge conservé** : le jeton passe **sous** `turn_env`, donc `ROSETTA_USER_TOKEN`
  et le retag de canal continuent de primer. Même forme qu'au premier site.

**`memory-sync` pose son identité git (2026-08-09)** : il commite depuis la **gateway** mais
n'a jamais posé `user.name` / `user.email` — elle venait de l'entrypoint de `claude-pod`, le
conteneur **tunnel**, qui partage le home. Couplage invisible et nulle part écrit, découvert
en retirant le tunnel d'Alfred (inutilisé). Son `.gitconfig` survit sur le hostPath, donc rien
ne casse aujourd'hui ; plus rien ne le recréerait. Même garde que l'entrypoint remplacé : on ne
pose que ce qui manque, et seulement si l'env le donne. Appelé avant les **quatre**
sous-commandes — `pull --rebase` et `resolve` créent des commits autant que `commit`.

> ⚠️ **`test/claude_token_test.py` : 2 cas rouges, PRÉEXISTANTS.** `flow_bad_code` (« code
> refusé → erreur », « pas de token stocké sur échec ») échoue déjà à `424f7fa`, donc avant les
> deux commits `setup-token` de la semaine — ce n'est pas une régression de cette release. Le
> chemin nominal du même fichier est vert, et les 9 autres fichiers passent. Test à polling sur
> pty : à rejouer hors du pod avant de conclure au bug.

> 🔎 **Env du pod = faux rouges.** `apps_test.py` et `mcp_async_test.py` échouent tant qu'on les
> lance depuis un tour d'agent : `GW_APPS` / `GW_FEATURES` / `GW_TRACE` du pod polluent les cas.
> Verts en `env -i`. Lancer la suite en env vierge, toujours.

**Le contrat de l'image devient un VRAI sur-ensemble — cinq points, PRÊT À PUBLIER
(2026-08-07)**. Demande d'Alfred, transmise par `ask_skippy`. Sa décision D45 allège ses
skills de workspace de tout ce que l'image dit déjà ; la contrepartie est que l'image doit
dire **tout** ce qu'il retire. Elle ne le disait pas sur cinq champs/blocs que les modules
**lisent pourtant** — vérifiés un à un dans la source, pas sur parole :

- `voyage.json` — **`status` à la racine** (`app/voyages.py:124` le sert, le front le rend
  en pastille sur la liste et l'en-tête) ; **`hint`** (accroche de la carte du tray, repli
  de `desc` dans la modale) ; **`fiche`** (le seul lien interne d'une carte — route déduite
  de l'extension, `.parcours.json` → `#/parcours/…`, une URL y est ignorée).
- `fiches-format` — le bloc **`{% parcours %}`** et sa `vue="lien"`, rendus depuis D44 mais
  absents d'un vocabulaire annoncé **FERMÉ**. Un catalogue fermé qui omet un bloc ne se lit
  pas comme incomplet : il se lit comme « ce bloc n'existe pas ».
- `workbook.json` — **`rot`** sur une pose de tronçonnage : `longueur` en x, `largeur` en y
  (`main.js:1954-1959`), **indépendant de `sens`** qui n'oriente que la bande.

> 🔎 **Deux écarts trouvés en vérifiant, corrigés dans la foulée.** (1) La pastille de
> `status` colore par mots connus (`sc()`), et **`prépa` n'y est pas** : il prend la teinte
> par défaut, celle d'`en-cours`. (2) Le contrat lamello disait que le rendu tient compte de
> `pose.rot` — la **vue Lamello ne lit jamais `rot`**, elle dessine toujours la pièce à plat ;
> seule la vue Débit l'applique. La phrase est reformulée plutôt que laissée ambiguë.

> ⚠️ **`idée` n'est pas une garde, c'est une déclaration.** Le module se cale sur les
> **dates** : pas de `debut`/`fin` ⇒ tray seul, confirmation refusée en 400. Le champ et les
> dates doivent s'accorder à la main — un `en-cours` sans dates rend une page qui annonce
> « à l'état d'idée ». Écrit tel quel dans le contrat, plutôt que de laisser croire à un
> invariant tenu par le code.

> ✅ **0.57.2 publiée et déployée (2026-08-10)** : tag `agent-gw-v0.57.2`, image GHCR
> **vérifiée présente au registre avant le bump**, et **les DEUX manifestes** bumpés. Les deux
> pods tournent `agent-gw:0.57.2` — Alfred à 2 conteneurs (son tunnel retiré), Skippy avec le
> sien. Le rappel « une image, deux corps » reste valable pour la prochaine.

> ↩︎ Les mentions « À TAGUER » ci-dessous sont **périmées** : `agent-gw-v0.57.1` (2026-08-07,
> 00:04) porte la tête de `main`, balade et parcours compris, et les deux corps y sont.

**Le mode balade, le hors-ligne, et la fiche qu'on pouvait enfin atteindre — taguée en
0.57.1 (2026-08-06)**. Trois chantiers d'un coup, tous nés d'un usage réel.

**1. Une fiche `.md` dans un dossier de voyage était ORPHELINE par construction.**
`#/dom/voyages/<id>` rend la timeline, pas le listing du dossier : Alfred avait rédigé une
balade complète que Monsieur n'a pu ouvrir qu'en tapant l'adresse à la main. Alfred
contournait en mettant une URL absolue dans `web` — qui est **externe par contrat** (nouvel
onglet, « ↗ Ouvrir la page »). Deux réponses, et il faut les deux : un champ **`fiche`** sur
la carte (lien interne, cible déduite de l'extension — `.parcours.json` ouvre la carte en
grand), **et** la page du voyage qui **liste** ce que le dossier contient. Compter sur le seul
lien remettrait la découvrabilité à un champ facultatif.

**2. Le mode balade** (bouton 🥾) : plein écran, position + **cercle de précision** + cap,
suivi qui recentre hors du tiers central, barre d'état « ce qui est fait / ce qui vient », et
wake lock **repris au retour au premier plan** (il se perd dès que l'onglet passe derrière).
Au-delà de 120 m de la trace, l'avancement est déclaré **hors trace** au lieu de rendre un
chiffre faux — sur une boucle, le point le plus proche peut être n'importe où.

**3. Le hors-ligne** (bouton ⤓) : le service worker, jusqu'ici un **bouchon vide** qui
n'existait que pour rendre la PWA installable, tient maintenant deux caches — la **coque** en
*réseau d'abord* (une PWA qui sert son vieux JS après un déploiement coûte des heures), la
**balade** en *cache d'abord* (sur un sentier, un réseau à dix secondes est pire que pas de
réseau).

⚠️ **SEUL LE PLAN IGN S'EMPORTE, et c'est le DROIT qui tranche, pas la technique.** La
politique OSM l'interdit en toutes lettres — « Offline use is not permitted on
tile.openstreetmap.org » — et nomme le préchargement d'une zone comme abus. L'IGN ne
l'interdit pas, affiche **aucun quota** sur la diffusion WMTS (vérifié dans leurs CGU), rend
`access-control-allow-origin: *` (donc de vraies réponses en cache, pas des opaques) et publie
en licence ouverte. Conséquence assumée : **hors de France, pas de hors-ligne**, le bouton
n'apparaît pas. Garde-fou dans la page ET dans le service worker.

⚠️ **Corridor, pas boîte englobante** : sur une rando linéaire la boîte est vide aux trois
quarts. Mesuré 69 tuiles contre 196 sur un tracé diagonal de 5 km. Requêtes **en série** — on
tire chez un service public gratuit, pas sur un CDN qu'on paie. Boucle de Vannes complète,
z15→z18 : **122 tuiles, ~5 Mo**. Le poids n'a jamais été le sujet.

⚠️ **iOS purge le stockage** après quelques jours sans visite (une PWA installée est traitée
plus généreusement, mais rien n'est garanti) : **emporter la veille**, pas le mois d'avant.

> MàJ précédente : 2026-08-05

**Les parcours — la moitié pod, ÉCRITE, À TAGUER (2026-08-05)** : Alfred fabriquait ses
GPX à la main (328 `<trkpt>` tapés au clavier pour la boucle de Vannes, cinq commits en
24 h, zéro `<ele>`). Le hub `rosetta` 0.12.0 apporte l'addon `trace` ; ici viennent les
deux pièces qui ferment la boucle. Spec complète : `images/agent-gw/PARCOURS.md`.

- **`trace-geom`** (CLI, stdlib seule, à côté de `memory-sync`) : lit les `reperes[].latlng`
  d'un `*.parcours.json`, appelle `/trace/geometrie` sur le hub avec l'identité machine
  (même client_credentials que `rosetta-bridge`), et **réécrit le bloc `trace`** du fichier.
  La géométrie va du hub au disque **sans passer par la conversation**. Il écrit aussi, par
  repère, `ecart_trace_m` et `distance_precedent_m`.
- **`app/parcours.py`** : `GET /api/parcours/gpx?f=…` assemble le GPX à la demande. Le
  `.gpx` n'est **pas** un fichier de la mémoire — c'est un dérivé. Ce qui se commite est le
  fait (repères rédigés + géométrie mesurée), jamais son rendu.

**La décision qui commande tout : deux matières, deux auteurs.** `trace` appartient à la
machine, `reperes[]` à Alfred. D'où la propriété qui justifie la séparation — **corriger
une description ne recalcule rien** ; seul l'ajout, le retrait ou le déplacement d'un
repère demande de relancer `trace-geom`. Les cinq commits de Vannes venaient exactement de
là : un seul fichier portait les deux matières.

**Validé de bout en bout** en refabriquant la boucle de Vannes par toute la chaîne et en la
comparant au fichier tapé à la main : **19 repères et 328 points identiques, écart maximal
0,63 m** (l'arrondi de la polyline, moyen 0,37 m), **328 `<ele>` contre 0**, et le GPX parse.

L'endpoint est borné aux `*.parcours.json` — pas à n'importe quel JSON de la mémoire — et
la garde de traversée est celle des magasins, comme `voyages`. Testé
(`./.venv/bin/python test/parcours_test.py`), les cinq autres suites passent toujours.

**Le rendu — bloc `{% parcours source="…" /%}`, livré dans la foulée.** Le bloc pose une ancre,
`frontend/src/parcours.js` va chercher le fichier et peint au montage : carte, repères numérotés
cliquables reliés à la liste, profil altimétrique, bouton GPX. **Sans bibliothèque de carto** —
Leaflet coûte 42 ko gzippés pour du zoom dont une fiche n'a pas besoin, alors qu'une mosaïque de
tuiles est une grille d'`<img>` et que Mercator tient en six lignes. Coût réel : **+8 ko sur
`engine.js`** (292 → 300 ko), tout compris.

Deux fonds vérifiés vivants le 2026-08-05, gratuits et **sans clé** : Plan IGN (`data.geopf.fr`,
WMTS `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`) et OpenStreetMap, avec un bouton de bascule. Le défaut
se choisit sur la position — l'IGN ne couvre pas l'étranger, et une carte vide serait une
régression silencieuse. ⚠️ Un 404 IGN peut venir de **coordonnées de tuile fausses**, pas du
service : vérifier le calcul avant d'accuser l'amont (piège rencontré).

L'invariant de `chart.js` tient : rien du contenu d'une fiche ne s'exécute. Aucun `innerHTML`
porteur de contenu mémoire dans `parcours.js` (tout par `textContent`), et le `web` d'un repère
est filtré sur http/https — un `javascript:` dans une fiche deviendrait du script au clic.

⚠️ **Défaut latent trouvé au passage, non corrigé** : `required: true` de Markdoc *signale* un
attribut manquant mais n'empêche pas le transform de tourner. `{% piece-jointe %}` (et `galerie`)
appellent `asset(undefined)` dans ce cas → l'exception emporte le rendu de **toute** la fiche, qui
s'affiche « Fiche introuvable ». `parcours` se garde lui-même ; les autres non. Un `if (!x)` dans
chaque bloc, ou un garde dans `asset()`, à arbitrer.

**Un parcours n'a PAS de domaine — tranché par Monsieur le 2026-08-05**, contre la proposition
d'un domaine `balades`. Une balade n'est pas un pan de vie : c'est une pièce jointe à quelque
chose qui, lui, en est un. Elle vit dans les `assets/` de la fiche qui a une raison d'en parler
(un voyage, un week-end, un lieu) et devient **adressable seule** par la route `#/parcours/…`,
qui monte exactement le même bloc en pleine page. D'où une seconde vue, `vue="lien"` : une carte
compacte (titre, distance, D+, durée) qui y mène, pour qu'une fiche puisse en citer trois sans
empiler trois cartes plein cadre. Un domaine dédié aurait forcé à trancher « Vannes est-elle un
voyage ou une balade ? » — une question sans réponse, donc une mauvaise question.

**Cinq retours d'usage sur la carte, tous traités le 2026-08-06** — aucun visible en relisant
le code, tous en regardant l'écran :
1. **Le profil était tracé par INDICE de point, pas par distance** : une épingle à cheveux
   occupait autant de largeur qu'un kilomètre de plat, la pente affichée n'était pas la vraie.
   Abscisse = distance cumulée, plus les **échelles** (altitudes bornantes, distances) et un
   trait par repère.
2. **Départ et arrivée superposés** sur une boucle : une seule pastille les porte (« 1·19 »),
   marquée départ ; les autres collisions s'écartent en éventail, avec un fil vers le point réel.
3. **Un aller-retour se cachait sous lui-même** : ligne semi-opaque (les passages s'additionnent
   et foncent) + **chevrons orientés** tous les 90 px — deux chevrons opposés sur la même rue
   disent « on y va et on en revient ».
4. **Bouton GPX remonté sous la carte**, plus en pied de page.
5. **Déplacement et zoom** (glisser, molette+Ctrl/⌘, double-clic, `+ − ⤢`, deux doigts).
   ⚠️ Le geste tactile est **partagé** : un doigt = la page défile, deux doigts = la carte.
   `touch-action:none` (ce que fait Leaflet) rendrait une fiche longue impraticable.

**« Le tracé a l'air faux »** — remonté par Monsieur, et il avait raison sur l'écran alors que
la donnée, elle, était juste (328 points, 3 038 m recalculés contre 3 036 annoncés, tous les
repères à moins de 27 m). **Trois causes de DESSIN, aucune de géométrie :**
1. ⚠️ **`* { box-sizing:border-box }` est global** et `.pc-map` porte une bordure : fixer
   `style.height = h` donne un intérieur de **h−2 px**. Le SVG en `height:100%` avec un viewBox
   de `h` unités s'y comprimait de 0,5 % pendant que tuiles et pastilles restaient en pixels
   bruts — le tracé glissait hors des rues, d'autant plus qu'on descendait. Le SVG porte
   désormais ses dimensions **en pixels**, les trois calques partagent un seul repère.
2. **L'éventail anti-collision déplaçait les pastilles de 20 px, soit ~32 m au cadrage** — un
   repère posé une rue plus loin que le monument qu'il nomme. Retiré le jour même : depuis que
   la carte se zoome, deux pastilles serrées se séparent d'un geste, alors qu'une pastille
   déplacée **ment** sans que rien ne le dise.
3. **Les largeurs de trait n'étaient pas calibrées sur l'échelle.** Au zoom de cadrage (z=16)
   1 px vaut **1,6 m** : une rue de 10 m fait 6 px, et je dessinais une ligne de 3,5 px sous un
   liseré de 7. Ramenés à 2,2 et 4,5.

Le dézoom est **plancherisé à un cran sous le cadrage** : au-delà on ne voit plus la balade,
on voit la région.

⚠️ **VOIR CE QUE LE FRONT DESSINE, SANS NAVIGATEUR — la technique qui a tranché.** Après ces
correctifs, « le tracé est toujours très faux » : impossible de savoir si le bug survivait ou si
le navigateur servait un vieux bundle. Trois pas, tous avec l'outillage déjà présent :
1. **La donnée d'abord**, en ASCII (64×26 dans le terminal) : la trace décodée et le GPX
   d'origine se sont superposés au caractère près → la géométrie était hors de cause.
2. **Le vrai code ensuite**, dans un **faux DOM** de trente lignes (`createElement`,
   `createElementNS`, `appendChild`) : `creerCarte(...).dessine()` tourne sous Node et on lit le
   `d` du `<path>`, les positions de tuiles et les pastilles réellement produits.
3. **L'image enfin** : on sérialise cette sortie en HTML statique (tuiles en `data:` base64,
   `<path>` inline) et **`qlmanage -t -s 1200 -o <dir> page.html`** en fait un PNG — QuickLook
   est dans macOS, rien à installer. ⚠️ Il ne **court pas le JavaScript** : la page doit être
   pré-rendue, sinon on thumbnaile du blanc (essayé).

Verdict : le code rendait juste, la boucle suivait les rues, `1·19` était bien fondu. C'était le
cache — la démo chargeait `engine.js` depuis `file://` **sans horodatage**. Elle porte désormais
`?v=<ts>` et affiche la **signature du bundle** en coin. Une page de test qui ment coûte plus
cher que pas de page de test du tout.

`creerCarte` est **exporté** pour ça : sans lui, l'étape 2 est impossible.

⚠️ **J'avais écrit que Leaflet était inutile « parce qu'une fiche n'a pas besoin de zoom ».**
L'argument était conditionnel et la condition est tombée. Ce qui reste : ~150 ko bruts sur un
bundle de 300 chargé pour chaque fiche, quand il n'a manqué que l'inverse de la projection et
trois écouteurs. Coût réel, gestes compris : **+11 ko**.

**Le picto d'un repère vit dans la LISTE, pas sur la pastille** (essayé, puis retiré : dix-neuf
emojis sur une carte ne se distinguent pas). La pastille garde son numéro — seul lien avec la
description.

**`{% callout %}` gagne `icone` et `couleur`** (12 teintes, celles des graphiques). Le `type`
reste fermé : il porte l'intention, pas le goût. C'est la vraie cause des quatre `type="info"`
du contenu — le besoin était l'allure, pas un quatrième type.

**Reste à faire sur ce chantier :**
- [ ] Côté cerveau : livré aussi (skill `balades`, D44, `.mcp.json`) — voir le repo Alfred.
- [ ] Déployer : `rosetta` 0.12.0 puis `agent-gw`, et vérifier `trace` **par le pont** (e2e).
- [ ] La carte n'a jamais tourné dans la VRAIE PWA, seulement dans une page de démonstration :
      le montage y passe par `showMem`. Même logique, mais à confirmer au premier `#/mem/…`.

**Cinq retouches de la PWA — À TAGUER (2026-08-04)** : remontées par Monsieur en usage réel,
quatre commits `agent-gw:`.

- **Le bandeau d'hébergement ferme la journée** au lieu de l'ouvrir : il porte la NUIT. La
  première liaison (« de l'hôtel · … ») reste en haut — on part de là où on a dormi.
- **Deux débordements, même cause** : une boîte plus haute que la fenêtre sans `overflow`. Le
  tray de suggestions est `sticky` (un sticky suit le défilement, il ne le produit pas : son bas
  passait sous le pli, définitivement) ; la modale est en `place-items:center` (une carte trop
  haute déborde des DEUX côtés, donc son haut aussi). Bornées à la fenêtre, elles défilent.
- **Les préambules de la passerelle remontaient dans la bulle de Monsieur.** Ils sont ajoutés au
  PROMPT (écran ouvert, pièces jointes, éphémère) ; le transcript garde le prompt entier, et
  `/api/history` le rejoue à chaque rechargement ET à chaque réconciliation après coupure — d'où
  le « parfois ». Retirés au rejeu (`_strip_gw_notes`), à partir des mêmes constantes qui servent
  à les écrire : la liste ne peut pas dériver du texte réellement injecté.
- **Le scanner voyait des codes fantômes.** Un lecteur 1D décode UNE LIGNE de pixels : sur une
  trame bruitée, elle tombe parfois sur un EAN-13 dont la clé de contrôle est juste par hasard
  (une chance sur dix, tirée huit fois par seconde). La clé ne rattrape pas ça — seule la
  RÉPÉTITION trie : 3 lectures identiques et rapprochées avant d'entrer au panier. Plus une
  croix par pastille, sans quoi un seul faux code condamnait le panier entier.

**`ENV HOME` remonté dans les TROIS images — À TAGUER (2026-08-03)** : découvert en basculant
Alfred sous `runAsUser: 3000` (uid d'une personne réelle, venu de holocron, absent de
l'`/etc/passwd` des images). Sans entrée passwd, **`$HOME` n'est pas résolu et vaut `/`** : tout
ce qui écrit sous le home part à la racine, en lecture seule.

- **Tunnel** : mort tout de suite — `could not lock config file //.gitconfig`. *Le double slash
  est la signature du diagnostic.*
- **Gateway** : démarre **normalement**, `2/3 Running` — elle n'écrit sous le home qu'au premier
  tour d'agent (`~/.claude`). C'est le cas dangereux : un pod qui a l'air de marcher.

Corrigé d'abord dans le manifeste (les trois conteneurs), puis **remonté dans les Dockerfiles** :
c'est une propriété de l'IMAGE (où vit le home), pas du déploiement. Une ligne ici évite d'y
penser dans chaque manifeste, et le prochain pod tournant sous un uid d'annuaire ne tombera pas
dessus. Gotcha consigné côté Skippy (`k8s-config.md`).

**Les contrats de format descendent dans l'image, et la mémoire devient composable — À TAGUER
(2026-08-03)** : suite directe du lot 1, mêmes décisions (dossier `memory/sujets/refonte-archi-alfred.md`
chez Alfred).

**Étape 2 — le contrat suit le code qui le lit.** `AUTHORING.md` (281 l.) et la skill `redaction`
d'Alfred (283 l.) décrivaient le MÊME contrat dans deux dépôts déployés séparément, chacun se
déclarant « source de vérité unique » ; idem `VOYAGES.md` et le workbook. Rien ne détectait la
dérive. Trois **plugins Claude Code livrés par l'image** (`plugins/fiches|atelier|voyages`),
chargés via `ClaudeAgentOptions.plugins` et **gatés par `GW_APPS`** : un module éteint n'apporte
pas son contrat, un module allumé l'apporte forcément à jour. `fiches` est le socle (la mémoire
n'est pas un module). Les docs du corps deviennent des pointeurs. **La frontière qui rend la chose
tenable :** l'image porte le FORMAT (qui ne bouge qu'avec le code, donc un build de toute façon),
le workspace garde le MÉTIER (qui se corrige au fil de l'usage).

> ⚠️ `COPY plugins ./plugins` dans le Dockerfile n'est PAS optionnel : sans lui aucun contrat ne
> part, et rien ne s'en plaint. Le chemin (`<parent de app>/plugins`) vaut en local comme dans
> l'image. Le chargement effectif par le CLI se vérifie au premier déploiement — le binaire
> `claude` vit dans l'image, pas sur le Mac.

**Étape 3 — `GW_MEMORY_STORES`, le composeur multi-magasins.** La mémoire peut désormais être
l'**union** de plusieurs racines (`perso=memory:rw,famille=/shared/famille:ro`). Un domaine n'est
plus rangé DANS un magasin : il se **compose** de ce que chacun en porte. **Le chemin logique ne
contient jamais le magasin** — c'est cette règle qui permettra de promouvoir une fiche d'un cercle
à l'autre sans casser un seul wikilink. Précédence = ordre de déclaration ; une collision est
**signalée** (`tree.collisions`), jamais tranchée en silence. Écritures toujours au magasin
principal. Couvert : `/api/memory/tree`, `/api/memory/index`, `/api/memory/raw`, workbooks,
voyages.

> 🛡 **Les planifications, elles, ne se composent PAS** — et c'est une garde, pas un oubli. Le
> corps d'une fiche `type: planif` est exécuté tel quel comme prompt (D30) : les lire sur l'union
> laisserait n'importe quel pair déposer du code qui tournerait ici. Seul le magasin possédé en
> écriture arme l'horloge.

> ✅ **Livré en configuration DÉGÉNÉRÉE, et c'est le propos.** Un seul magasin déclaré ⇒ l'union
> d'un ensemble à un élément est l'identité. Prouvé par un **diff octet à octet** sur la vraie
> mémoire d'Alfred — **239 entrées, 159 fiches**, `/api/memory/tree` et `/api/memory/index`
> identiques avec et sans le composeur. 30 tests neufs (`test/stores_test.py`), **éprouvés à
> l'envers** (champ ajouté en mono → FAIL ; précédence inversée → FAIL). 8 suites Python vertes.

**La modularité s'arrêtait au navigateur — DÉPLOYÉ (2026-08-03, agent-gw 0.52.0)** : lot 1
d'un chantier d'architecture décidé avec Monsieur le 2026-08-02 (dossier complet dans le dépôt
d'Alfred, `memory/sujets/refonte-archi-alfred.md`). `GW_APPS` et `GW_FEATURES` ne franchissaient
jamais la frontière du corps : `main.py` montait le preset claude_code avec
`setting_sources=["project"]` et **rien d'autre**. La PWA masquait donc une tuile pendant que
l'agent croyait toujours le module présent — il proposait des pages que ce pod ne sert pas et
écrivait des fichiers que rien n'affiche. `_system_prompt()` ajoute désormais l'**état de
l'instance** au preset (`append`, donc le `CLAUDE.md` du workspace gouverne tout le reste) :
l'état, et jamais un contrat de format ni un savoir de métier — ceux-là appartiennent au
workspace, pas à une variable d'environnement. `_instance_facts()` est un **assembleur** (une
entrée par axe) et non une phrase câblée sur les deux axes du jour : les magasins mémoire du
chantier multi-utilisateurs viendront s'y poser sans que les appelants bougent.

**Une app était enfermée dans un thème (même branche)** : la vue `repos` vivait dans
`skins/skippy.js` (`routes: { repos }`) alors que `repos` était **déjà** un module déclarable et
que `/api/repos` répond quel que soit le thème — `GW_APPS=repos` sur un pod en livrée neutre
donnait donc une **route morte**. C'est une app comme les autres désormais : `renderRepos()` dans
la coque sous `appOn('repos')`, une entrée dans `APP_META` (tuile 🛰️ « La flotte ») et sa tuile
d'accueil. Le contrat de skin **perd `routes`** — tant qu'il les autorisait, le mélange se
serait reproduit au corps suivant. `home` reste au skin, et c'est délibéré : le défaut était
unidirectionnel (le HUD teste déjà `appOn('repos')` et se replie proprement), et l'accueil est le
seul écran dont la forme EST l'identité du corps — l'en sortir coûterait un quatrième axe de
configuration pour un besoin que personne n'a.

> ✅ **Déployé et vérifié** — image `0.52.0` (index OCI amd64 + arm64) contrôlée **au manifeste
> registry** avant de bumper, les **deux** manifestes poussés (`alfred-helm.yml` ET
> `skippy-helm.yml`), refresh ArgoCD forcé, pods `alfred` 3/3 et `skippy` 2/2 Running, 0
> redémarrage. `launcher.js` servi par les deux corps au **SHA-256 exact du build local**
> (`b17d805d…`). Les deux écrans avaient été regardés à l'œil avant tag, PWA montée en local
> sur les 24 dépôts du Mac.

> ☠️ **La vue s'est rendue DANS LE VIDE, et rien ne l'a vu — sauf une capture d'écran.**
> `page` est un **getter** de l'API du lanceur (`get page() { return page; }`), parce que le nœud
> n'existe pas encore quand les extensions sont instanciées : `const page = $('view')` vient
> soixante lignes plus bas. L'app le **destructurait** (`const { page } = api`), figeant donc
> `undefined` — fil d'Ariane correct, écran blanc, `TypeError` avalé dans une promesse. Les
> **skins y échappent par accident** : ils sont re-résolus au boot (`loadApps`), les apps le sont
> à l'import. Build vert, `npm test` vert, sonde de mangling verte, lint vert : **cinq contrôles
> au vert sur un écran mort**. Le seul qui a mordu est le navigateur — PWA montée en local sur
> les 24 dépôts de ce Mac, capture Chrome headless, regardée. Même leçon qu'en 0.47.0 avec le
> décodeur de code-barres, apprise deux fois.

> 🔎 **Un registre `launcher/apps/`, symétrique de celui des skins.** `repos` n'est pas posé en
> vrac dans un `main.js` de 2 800 lignes : il a son dossier (`apps/repos.js` + `apps/repos.css`,
> la feuille importée par le JS donc agrégée au bundle), et `apps/index.js` porte le contrat —
> une fabrique `(api) => { routes }`, injection explicite comme pour les skins, une app qui jette
> n'emporte pas les autres. Les quatre autres modules restent dans `main.js` : on les déplacera
> quand on y touchera de toute façon, pas pour la symétrie. **Et `resolveSkin` filtre désormais
> sur liste blanche en signalant ce qu'il jette** — la frontière « un thème habille, il ne route
> pas » était déjà écrite et elle a dérivé quand même ; une convention que rien ne vérifie n'en
> est pas une. `theme-lint` gagne un contrôle **1 bis** : une feuille d'app suit le contrat de la
> COQUE (aucune couleur littérale, aucun rayon en pixels, et **aucune déclaration de jeton** —
> une app consomme la charte, elle ne la définit pas), et ses classes entrent dans
> `shellClasses`, sinon un thème pourrait repeindre `.repo` sans scope. Éprouvé à l'envers :
> violation introduite → 3 échecs, restauration → vert.

> 🔎 **Le CSS a suivi, et il révèle une entorse ancienne.** Les surfaces HUD (`.hud`, `.panel`,
> `.fleet`, `.repo`, les tuiles…) vivaient dans `skippy.css` : le contrôle 3 du lint ne les
> tolérait que parce que la coque **ignorait** ces classes. Faire de `repos` une app les lui fait
> connaître, donc elles montent dans `launcher.css` — où elles auraient dû être depuis le début.
> Ce sont des composants, et un thème déclare des jetons, il ne dessine pas. Bonus : le
> `content:"SKIPPY"` du calque fantôme passe par `var(--ghosttag)`, jeton qui existait déjà et
> valait la même chaîne. `skippy.css` ne garde que `.console`. **Zéro renommage, donc zéro
> régression visuelle attendue chez Skippy** — mais ça reste à voir à l'œil.

> ⚠️ **Le piège s'est refermé sur moi en direct — il est verrouillé maintenant.** Les options se
> construisent à **deux** endroits (`_run_alfred` pour les tours MCP et planifiés, `run_turn`
> pour la PWA), à deux profondeurs d'indentation différentes : un remplacement global n'en
> attrape qu'un. Le premier passage n'avait câblé que la PWA — les tours planifiés et MCP
> seraient restés aveugles, **sans aucun symptôme visible**. Deux tests l'interdisent désormais :
> aucun preset littéral hors de `_system_prompt`, et autant de `system_prompt=_system_prompt()`
> que de `ClaudeAgentOptions(`.

**Un rechargement ne perdait pas le tour, il perdait le TÉMOIN — DÉPLOYÉ (2026-08-02, agent-gw 0.51.0)** :
signalé au doigt (« je fais un refresh, je ne vois plus qu'il travaille »). Normal et structurel : le flux
SSE appartient à la requête `POST /api/chat`, F5 la tue, et `busy` n'est qu'une variable JS. Le tour, lui,
survit — c'est tout l'objet de la tâche détachée. **Mais le défaut réel était pire que le symptôme** : la
réponse arrivait au transcript et la page restait muette, parce que `resyncHistory()` n'est branché que sur
`visibilitychange`/`online`, jamais sur un simple rechargement. Il fallait changer d'onglet ou recharger une
seconde fois pour voir une réponse déjà écrite sur le disque. `adoptRunningTurn()` interroge donc le corps au
boot (après le rendu de l'historique, pour que `historyLen` soit posé), remet le témoin et l'indicateur de
frappe, sonde toutes les 2 s, puis pose la réponse et vide la file. **Le discriminant est `chat_busy`, pas
`busy`** : ce dernier est le verrou global, vrai aussi pour une planification ou un travail déposé par un
autre agent — une bulle de frappe dans la conversation de Monsieur pour le briefing de 7 h serait un
mensonge. `chat_busy` est exactement `_current_client is not None`, donc offert par le registre de 0.50.0.
Effet de bord heureux : un tour repris après rechargement est un tour qu'on peut **arrêter**. Un corps
injoignable ne conclut rien (on retente, on ne déclare pas la fin). `test/stop_test.py` monte à 19 cas.

> ✅ **Déployé et sondé** — image `0.51.0` (index OCI amd64 + arm64) contrôlée au manifeste registry avant
> de bumper ; le push k8s a été **rejeté** (Renovate venait de passer sur `ha-mcp` v8) → rebase, pas de
> force, et vérification que le diff amont ne touchait pas `assist/`. `launcher.js` servi par **alfred ET
> skippy** au SHA-256 du build local (`3bd5c26e…`, 117 541 octets) 60 s après le push, et `/api/health`
> rend bien `chat_busy` sur les deux corps — la preuve la plus directe que c'est 0.51.0 qui tourne.
>
> ⚠️ **Reste à voir à l'usage** : `chat_busy` retombe quand `_current_client` se vide, c'est-à-dire à la
> sortie du `async with ClaudeSDKClient(...)`. La sonde du front peut donc conclure la fin du tour une
> fraction de seconde avant que le transcript ne soit relu — `resyncHistory()` est appelé juste après, et
> `visibilitychange`/`online` restent en filet. Si une réponse manquait après un rechargement, c'est là
> qu'il faudrait regarder (ordre `_turn_ended()` / écriture du transcript), pas ailleurs.

**On peut enfin arrêter un tour — DÉPLOYÉ (2026-08-02, agent-gw 0.50.0)** : signalé au doigt (« pas moyen
d'arrêter un tour en cours »). Exact, et ce n'était pas un oubli : `run_turn()` est **délibérément
détachée** de la réponse HTTP depuis qu'un écran mobile verrouillé tuait le tour en plein vol. Restait
l'arrêt volontaire, jamais recâblé par-dessus. **`task.cancel()` était le piège** — il rejouait
exactement cette panne (transcript laissé ouvert, « Continue from where you left off. » au tour
suivant). Le vrai mécanisme est le signal d'arrêt du CLI, et il n'existe **que** sur `ClaudeSDKClient`,
pas sur le `query()` one-shot : la boucle du chat passe donc au client persistant
(`client.query()` + `receive_response()`), `POST /api/chat/stop` appelle `interrupt()`, et le tour se
termine proprement avec son `ResultMessage` — le pointeur de session reste sain. L'endpoint **ne prend
pas `_query_lock`** (l'attendre serait attendre la fin du tour qu'on interrompt). Le chemin
planifié/MCP (`_run_alfred`) reste sur `query()` : personne n'est devant pour cliquer. Côté front, le
bouton d'envoi devient un bouton d'arrêt quand un tour tourne **et** que le composer est vide — la
condition « vide » est ce qui rend la bascule sans risque. La file d'attente n'est pas vidée : arrêter
le tour en cours n'annule pas ce qu'on a demandé ensuite. `test/stop_test.py` couvre les 13 cas
(idle, idempotence, verrou tenu, drapeau qui se rabaisse au tour suivant).

> ✅ **Déployé et sondé** — image `0.50.0` (index OCI amd64 + arm64) contrôlée au manifeste registry
> avant de bumper, les deux manifestes k8s poussés, et `launcher.js` servi par **alfred ET skippy** au
> SHA-256 exact du build local (`5401e94f…`, 117 034 octets) 200 s après le push. `POST /api/chat/stop`
> répond **401** sans session sur les deux corps : la route existe et elle est bien derrière la garde
> (un 404 aurait dit l'inverse).
>
> ⚠️ **Ce que la sonde ne prouve PAS** : que `interrupt()` referme le transcript aussi proprement que
> la doc du SDK l'annonce. Le refactor `query()` → `ClaudeSDKClient` n'a pas de face en test — il faut
> le vrai CLI. Le contrôle est un geste humain : arrêter un tour long, puis envoyer un message et
> vérifier qu'**aucune bulle parasite** ne le précède. Si elle réapparaît, c'est là qu'il faut
> chercher, pas ailleurs.

**Le fil d'Ariane envoyait les fiches hors-domaine dans le vide — DÉPLOYÉ (2026-08-02, agent-gw 0.49.1)** :
signalé au doigt depuis `#/mem/planif/briefing.md`, dont le maillon « Planifications » menait à
`#/dom/planif` — une page à titre seul, alors que l'accueil, lui, pointe `#/planif`. La cause est
structurelle, pas locale : `renderFiche()` fabriquait `#/dom/<seg>` pour **tout** premier segment,
or `#/dom/x` se résout sous `domaines/x/` (`memPrefix()`). Les racines qui ne sont pas des domaines
— `todo/`, `planif/`, `home/` — n'existent donc pas là-bas, et **toute** fiche de todo portait le
même lien mort. Trois pièces : `ROOT_ROUTE` mappe une racine sur la route de son module (et
seulement s'il est allumé, `appOn`) ; un maillon de fil d'Ariane peut désormais être **inerte**
(libellé sans lien — il reste dans `CR`, donc dans le `titre` du contexte d'écran, et « Retour »
remonte au dernier maillon qui mène quelque part) ; et `renderDomain()` **redirige** `#/dom/todo`
/ `#/dom/planif` vers le module, ce qui neutralise aussi les marque-pages et une `cible` de type
domaine écrite par l'agent dans `brief.json`.

> ✅ **Vérifié en prod** — image `0.49.1` (index OCI amd64 + arm64) contrôlée au manifeste registry avant
> de bumper, les deux manifestes k8s poussés (`alfred-helm.yml` **et** `skippy-helm.yml`), et
> `launcher.js` servi par **alfred ET skippy** au SHA-256 exact du build local (`95c473df…`,
> 116 604 octets) 200 s après le push.

**Le chat sait ce que Monsieur regarde — DÉPLOYÉ (2026-08-01, agent-gw 0.49.0)** : sur desktop la PWA est
un split (chat à gauche, canvas à droite), et le chat ignorait totalement l'autre volet — « ça »
ne désignait rien. Le front joint désormais `vue: {route, titre}` à chaque `POST /api/chat`
(`currentView()`, bâti sur `currentRoute()` et le fil d'Ariane `CR`), que `_view_note()` préfixe
au prompt en une ligne. **La route et le fil d'Ariane, jamais le contenu de la page** : les
cartes citent du texte tiers (Gmail, OFF) qui perdrait son étiquette « non fiable » en entrant
dans le prompt — c'est le piège de D40, par la porte de service. L'entrée est bornée à 200
caractères et aplatie sur une ligne (un hash s'oriente par un lien qu'on fait cliquer ; un saut
de ligne mimerait une consigne du harnais), et la note se dit **indice, pas sujet imposé** :
regarder une fiche et parler d'autre chose reste gratuit. Rien n'est joint depuis l'accueil ni
sur mobile replié sur le chat. `test/vue_test.py` couvre les 18 cas (absences, troncature,
aplatissement, types tordus).

> ✅ **Vérifié en prod** — image `0.49.0` contrôlée **au manifeste registry** (index OCI
> `linux/amd64` + `linux/arm64`) AVANT de bumper, sans docker : jeton anonyme sur
> `ghcr.io/token?scope=repository:antorfr/agent-gw:pull`, puis `GET /v2/.../manifests/0.49.0`
> avec l'`Accept` de l'index. Les deux manifestes k8s bumpés (`alfred-helm.yml` **et**
> `skippy-helm.yml` — l'image sert les deux corps), ArgoCD a fait tomber les deux pods, et
> **`launcher.js` servi par `alfred` ET par `skippy` a le SHA-256 exact du build local**
> (`4f769704…`, 116 350 octets) : les deux tournent sur les nouveaux octets.

**Le glyphe d'une carte voyage se choisit — DÉPLOYÉ (2026-08-01, agent-gw 0.48.0)** : signalé au doigt
(« un marché en aviron ? »). L'icône était déduite du seul `type`, dont le vocabulaire est
fermé et grossier (`hebergement|resto|activite|visite|trajet`) — tout ce qui n'est ni resto ni
visite tombe en `activite`, donc en 🚣. Le champ `ico` par carte existait déjà… **à moitié** :
honoré sur la carte de timeline et la fiche, ignoré au tray, aux écartées, au bandeau
d'hébergement et à la vue « idée » — et **non échappé** alors qu'il part en `innerHTML`. Un
seul `vicoOf()` (échappé, repli sur le type) désormais appelé aux six endroits. Le `type` reste
la **classification** (couleur, facettes, décompte des nuits) ; il ne dicte plus le dessin. Côté
cerveau, la skill `voyages` d'Alfred lui dit désormais de **poser un `ico`** sur chaque carte
qu'il crée.

> ✅ **Vérifié de l'extérieur, sans kubectl** — j'étais **hors du domicile** : le VPN route bien
> `192.168.10.11` (ping OK) mais le DNS LAN ne répond pas, donc `kubectl` (nom court `homenode`)
> et `ssh` (port 22) sont restés injoignables. Le contrôle est passé par l'ingress en forçant la
> résolution : `curl --resolve <host>:443:192.168.10.11`. **`launcher.js` servi par `alfred` ET
> par `skippy` a le SHA-256 exact de mon build local** (`22b21b70…`, 116 136 octets) — preuve de
> bout en bout que les deux corps tournent sur les nouveaux octets. `/api/version` répond **401**
> sur les deux : la garde d'auth n'a pas bougé. Image GHCR **vérifiée au manifeste registry**
> (index OCI `linux/amd64` + `linux/arm64`) AVANT de bumper.
> 🔎 **`curl --resolve` est le contournement à retenir hors domicile** : il garde SNI et
> validation de certificat entiers, là où `--server=https://homenode.berard.me:6443` échoue
> (le cert du cluster ne porte ni FQDN ni IP).

**Le lecteur de code-barres était MORT en production — DÉPLOYÉ (2026-08-01, agent-gw 0.47.0)** :
signalé au doigt sur l'iPhone (« la caméra s'ouvre avec le cadre, mais rien ne se détecte »).
La caméra n'y était pour rien : **le décodeur de repli ne pouvait mathématiquement rien lire**.
`scan/main.js` passait le RGBA d'un canvas à `RGBLuminanceSource`, qui ne dépaquette QUE de
l'`Int32Array` (il teste `BYTES_PER_ELEMENT === 4`) et prend un `Uint8ClampedArray` pour de la
**luminance déjà prête, un octet par pixel** : à la place de chaque ligne, zxing lisait un quart
de ligne d'octets R,G,B,A entrelacés. Du bruit, à chaque trame, pour toujours. Conversion en
luminance faite maison (BT.601 en entiers, tampon réutilisé d'une trame à l'autre).

> 🔎 **Deux autres défauts sortis du même log, et aucun ne se voyait à l'œil.**
> ① `MultiFormatReader.decode(image)` **sans second argument** compare `this.hints !== hints`
> avec `hints === undefined` → il rappelle `setHints(undefined)` et **remplace nos lecteurs par
> la liste complète** dès la première trame : les `POSSIBLE_FORMATS` — qui sont une **garde de
> sécurité**, pas un réglage — étaient jetés, et QR/DataMatrix/Aztec/PDF417/MaxiCode tournaient
> sur chaque image. ② Dans cette version, `NotFoundException` **n'hérite pas** de
> `ReaderException` : `MultiFormatReader` traitait donc « pas de code dans cette trame » — le cas
> NOMINAL — comme une anomalie et en journalisait la **pile**, huit fois par seconde sur le
> téléphone. Les deux disparaissent en passant par `MultiFormatOneDReader` directement.

**Le viseur mentait, et ça coûtait la lisibilité** : la `<video>` est en `object-fit: cover`, donc
un capteur paysage sur un écran portrait n'affiche qu'une bande centrale — mais le repli décodait
la trame ENTIÈRE écrasée à 640 px. Le code visé tombait sous **2 px par module**, seuil en dessous
duquel un EAN-13 cesse d'être lisible. Désormais `visibleFrame()` rend au décodeur exactement le
champ affiché, à 800 px. Ajouté aussi : un `BarcodeDetector` natif qui échoue **bascule** sur
zxing au lieu d'avaler l'erreur en boucle (`.catch(() => [])` laissait le scan muet à vie).

**Le bundle de repli fond de 448 Ko à 138 Ko (31 Ko gzip)** : `@zxing/library` ne déclare pas
`sideEffects: false`, donc esbuild ne peut rien élaguer du barrel. Imports **profonds** sur
`esm/core/…` — le risque du chemin interne est couvert, il ne casse pas en silence mais fait
échouer `npm run build` **et** le test de décodage, qui bundle ce fichier.

> ⚠️ **La leçon, et elle est chère : « le décodage n'est pas testable sans navigateur » était
> FAUX.** C'est cette phrase, en tête de `scan-test.mjs`, qui a laissé partir un décodeur mort
> derrière 23 tests verts — tous sur la logique pure, aucun sur l'image. Un EAN-13 s'engendre
> depuis sa spec en trente lignes et un `ImageData` n'est qu'un `Uint8ClampedArray` : aucune
> caméra requise. **9 tests neufs** (`frontend/test/scan-decode-test.mjs`) qui bundlent le
> fichier RÉELLEMENT livré et décodent EAN-13/EAN-8, contraste faible, trames vide/bruitée, deux
> trames d'affilée — plus un **contre-exemple ITF** qui échouerait si les hints resautaient.
> Suite JS complète au vert. Aucun Python touché. **DÉPLOYÉ en 0.47.0** (même tag que la
> bascule MCP ci-dessous — les deux chantiers étaient non tagués au moment de la publication).

> ✅ **Vérifié depuis l'extérieur et déconnecté**, comme l'exige le gotcha 0.40.1 :
> `/static/scan.js` → **200 `text/javascript`, 141 392 octets** (c'était 459 077 en 0.44.0, donc
> ce sont bien les nouveaux octets qui sont servis), `/` toujours **307** — la garde d'auth n'a
> pas bougé. Les **deux** corps tournent sur `agent-gw:0.47.0`, tous conteneurs `ready`.
> ⚠️ Le seul contrôle qui reste hors de portée d'un Mac est le même que la dernière fois : un
> code-barres réel devant l'objectif de l'iPhone. Cette fois le décodage lui-même est sous test
> (`scan-decode-test.mjs`), donc ce qui reste à éprouver est l'optique, pas l'algorithme.

**La surface MCP passe en ASYNCHRONE — DÉPLOYÉ (2026-08-01, agent-gw 0.47.0)** : `ask_<agent>`
`await`ait un tour complet sous `_query_lock`. Derrière la PWA ou l'horloge, l'appel attendait
donc **sans timeout, sans identifiant et sans un octet sur le fil** jusqu'au timeout HTTP de
l'appelant — Alfred a perdu des demandes sans jamais pouvoir les reprendre, incapable même de
distinguer « en cours » de « jamais arrivé ». Désormais : `ask_<agent>` rend
`{job_id, status:"accepted", queued_behind, busy}` **immédiatement**, le tour part en tâche de
fond, et `ask_<agent>_status(job_id)` récolte `pending`/`running`/`done`/`error` (+ `reply` et le
`task_id` de reprise). File bornée par `GW_MCP_MAX_PENDING` (4) : au-delà, **refus immédiat** —
un refus est une information, un silence n'en est pas une. Rappel croisé optionnel
(`GW_PEER_MCP_URL`/`_TOKEN`/`_TOOL`, inerte tant que non câblé) : à la fin du travail, on ouvre un
tour chez le demandeur avec le compte rendu. 28 tests neufs (`test/mcp_async_test.py`), suite
complète verte, **deux contrôles éprouvés à l'envers** (anti-boucle cassé → FAIL ; `create_task`
retransformé en `await` → FAIL).

> 🔎 **Pourquoi PAS les tâches MCP ni l'élicitation — mesuré, pas supposé.** MCP 2025-11-25 a
> exactement ce qu'il faudrait sur le papier. Sonde jetable (serveur FastMCP dans `/tmp` du pod)
> interrogeant le **client réel** via `ctx.session.client_params` : `claude-code 2.1.220`,
> `protocolVersion 2025-11-25`, capacités déclarées `elicitation{form,url}` ·
> `roots{listChanged}` · `sampling: null` · **`tasks: null`**. Les tâches ne sont donc pas
> négociables avec ce client, quel que soit le support serveur (côté python elles vivent dans
> `mcp.shared.experimental`, « may change without notice », et **zéro** occurrence dans
> `mcp/server/fastmcp/`). L'élicitation, elle, est déclarée **et fonctionne** — mais un
> `ctx.elicit()` rend `action=cancel` en mode headless : elle réclame un humain devant le
> client, ce qu'un agent n'a jamais. ⚠️ **Et le mur n'est pas là** : une notification MCP
> n'atteint qu'un client **connecté**, or un agent n'existe qu'entre deux tours. Ce qui réveille
> un agent est une requête HTTP entrante — d'où le rappel croisé, et non le protocole.

> ⚠️ **Contrat rompu à dessein, à annoncer aux deux cerveaux.** `ask_<agent>` ne rend plus
> `{reply, task_id}`. La description de l'outil le dit en toutes lettres (« ASYNCHRONOUS: …
> returns immediately with a job_id »), donc un agent appelant s'adapte à la lecture — mais un
> code qui lirait `.reply` en dur ne verrait rien.

**Déploiement** : tag `agent-gw-v0.47.0` → image GHCR **multi-arch vérifiée au manifeste
registry** (`linux/amd64` + `linux/arm64`) → les **deux** manifestes bumpés 0.46.0 → 0.47.0 →
pods `alfred` 3/3 et `skippy` 2/2 Running, 0 redémarrage, tous deux sur
`ghcr.io/antorfr/agent-gw:0.47.0`, `GW_VERSION=0.47.0`. Surface servie vérifiée **dans le pod**
(`tools/list` via le vrai endpoint) : `ask_alfred` **et** `ask_alfred_status`. **E2E prouvé en
prod** : un `ask_alfred` par l'ingress a rendu `{job_id, status:"accepted", queued_behind:0,
busy:true}` **instantanément**, puis `ask_alfred_status` a rendu `done` + la réponse ; un
`job_id` inconnu est refusé proprement.

> 🔎 **Piège d'attente d'un run multi-image — ne pas sonder `gh run list --limit 1`.** Le
> workflow a une **matrice** (`agent-gw`, `claude-pod`, `alfred-voice`) et chaque image saute le
> tag qui ne la concerne pas : deux jobs finissent en secondes, le troisième construit en ARM
> émulé pendant ~7 min. Sonder la liste rend le run **le plus récent**, pas le nôtre → j'ai
> annoncé « image construite » alors que 0.47.0 renvoyait encore 404 au registre. Le contrôle
> juste : `gh run view <id> --json jobs` filtré sur `build (agent-gw)`, **puis** le manifeste au
> registre avant de toucher au cluster.

**Rappel croisé CÂBLÉ en croix (2026-08-01)** : `GW_PEER_MCP_URL/_TOKEN/_TOOL` posés dans les
**deux** manifestes. Chacun vise le `/mcp/` de l'autre par son **nom de service** (le Host est
alors listé dans le `GW_MCP_ALLOWED_HOSTS` du pair, sinon FastMCP répond 421) et porte le jeton
du **PAIR** — on s'authentifie chez lui, pas chez soi. **E2E prouvé en prod**, chronologie
relevée dans les deux journaux :

```
ALFRED                              SKIPPY
22:11:46  appel entrant (ask_alfred)
22:12:02  tour démarre ───────────►
                                    22:12:06  appel entrant + tour   ← le rappel, seul
22:12:53  appel entrant (statut)              (AUCUN rappel en retour)
```

L'accusé de réception est revenu en **0,01 s**, le travail a rendu `done` + sa réponse, et
`notify_error` est resté vide. ⚠️ **Le garde-fou anti-boucle tient en vrai** : le tour né du
rappel porte `notify=false`, Skippy n'a pas rappelé Alfred — sans quoi les deux corps se
renverraient des comptes rendus jusqu'à épuisement de l'abonnement.

> 🔎 **Le contrat rompu a été porté aux DEUX cerveaux, pas seulement au corps.** Côté Skippy :
> `context/homelab/mcp-oauth.md` (la fiche décrivait encore l'appel bloquant). Côté Alfred :
> transmis **par son propre canal** (`ask_alfred`, `notify=false`) pour qu'il applique sa
> discipline d'amélioration — il en a tiré **D41**, une section de `CLAUDE.md`, et la réécriture
> d'une fiche mémoire devenue un contresens. Un corps qu'on déploie sans prévenir les cerveaux
> laisse deux configs qui mentent.

**`GW_FEATURES` — les capacités de la coque, désactivables par corps — DÉPLOYÉ (2026-07-31,
agent-gw 0.46.0)** : `GW_APPS` disait où l'on peut **aller** (tuiles et routes) ; rien ne disait
ce que le chat sait **faire**. Un lecteur de code-barres chez un agent de code n'a aucun sens, et
la seule façon de l'éteindre aurait été un `if agent == skippy` dans la coque — exactement ce
qu'on venait de retirer du CSS. Même patron que les modules et les thèmes : **la coque interroge
un registre publié par `/api/version`, jamais le nom du corps**. Capacités : `scan`, `attach`,
`eph`, `tunnel`, `sujets`. Défaut = jeu historique, Alfred ne bouge pas.

> ⚠️ **On RETIRE du DOM, on ne masque pas.** Un nœud absent ne reçoit aucun événement, ne prend
> pas le focus clavier, et **ne peut pas déclencher le chargement paresseux d'un bundle** — le
> décodeur de code-barres pèse 448 Ko. Un `display:none` laisserait les trois. Appliqué **avant
> le premier rendu** (le boot attendait déjà `/api/version`), sinon on verrait apparaître puis
> disparaître des boutons que ce corps n'expose pas.

> ⚠️ **Une capacité se coupe À LA SOURCE, pas bouton par bouton.** Retirer 📎 sans toucher au
> coller ni au glisser-déposer laisserait **deux portes d'entrée** ouvertes sur une capacité
> censée être éteinte. D'où le point de passage unique `takesFiles`. La garde de navigation,
> elle, reste **inconditionnelle** : même sans pièces jointes, un fichier lâché par erreur ne
> doit jamais faire quitter la session.

> 🛡 **Le bouclier n'est PAS dans la liste, et ce n'est pas un oubli.** C'est une garde, pas un
> composant : la seule façon pour Monsieur de consentir à une action sensible. Une garde qu'on
> éteint par variable d'environnement est un piège — le jour où quelqu'un la retire « parce
> qu'elle gêne », il ne reste plus rien entre un outil d'écriture et un contenu non fiable. Un
> test verrouille son absence de toute liste.

8 tests neufs (`test/apps_test.py`), dont **deux qui verrouillent les deux listes l'une sur
l'autre** — le défaut Python et le repli JS. Si elles divergeaient, la panne serait **muette** :
un pod dont l'appel `/api/version` rate exposerait un jeu de contrôles différent de sa config.
Éprouvés à l'envers (désynchronisation introduite → FAIL).
**Déployé** : tag `agent-gw-v0.46.0` → image multi-arch vérifiée au manifeste registry → les
**deux** manifestes bumpés → pods `alfred` 3/3 et `skippy` 2/2 Running, 0 redémarrage.
Vérifié **dans les pods** (`/api/version` est gardé, même en localhost — le middleware passe
avant le routage) : skippy annonce `['attach','eph','tunnel','sujets']`, alfred le jeu complet.

> 🔎 **Piège de vérification — ne pas grepper un nom de FONCTION dans un bundle minifié.**
> `grep applyFeatures` sur le `launcher.js` **servi** rend **0** alors que le code est bien là :
> esbuild renomme tout ce qui n'est pas une chaîne littérale. (Même trap que pour les noms de
> classes, déjà consigné plus bas.) Le contrôle qui, lui, ne ment pas : **comparer l'empreinte**
> du bundle servi à celle du `dist/` construit à HEAD —
> `curl -s https://<hôte>/static/launcher.js | shasum -a 256`. Fait : identique au bit près sur
> les deux hôtes.

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
`@zxing/library` faisait alors 448 Ko / **116 Ko gzip**, contre ~1,2 Mo de binaire à
vendoriser, servir et localiser. Moins d'infra pour le même résultat. *(Chiffre périmé : le
bundle est descendu à 138 Ko / 31 Ko gzip par imports profonds — cf. l'entrée en tête.)*

> 🔎 **Le 3ᵉ bundle est la seule chose qui rend le repli gratuit — et une fuite ne se
> verrait PAS.** Si `@zxing/library` remontait dans `launcher.js` (un import mal placé
> suffit), chaque chargement de page paierait le décodeur pour une fonction que la plupart des
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

> ⚠️ **Cet essai-là a fini par être fait — et il a ÉCHOUÉ.** Le seul contrôle qui restait (le
> scan lui-même, au doigt sur l'iPhone) a montré un décodeur incapable de lire quoi que ce soit,
> pendant que tout le reste — octets servis, caméra, `playsinline`, overlay — fonctionnait. Tout
> ce qui précédait prouvait que les octets étaient servis, pas qu'un code se lisait. Correctif et
> tests : entrée en tête de fichier.

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
`google_guard.py` n'y laisse passer que les **lectures** Google, **toute écriture refusée** —
brouillon et `calendar_create` compris : une horloge ne fabrique pas d'objet partagé que
personne n'a relu, et le bouclier reste inarmable sans témoin. Contre le **blanchiment** (mail
hostile lu sans témoin → résumé dans memory/ → relu comme fiable au tour suivant), la parade
n'est plus le refus de lire mais la **quarantaine verbatim** côté cerveau : le canal planifié
recopie le contenu tiers mot pour mot et ne le résume jamais. ⚠️ **D40 (31/07) amende D30 sur
ce point** — jusque-là la surface était fermée en entier, lectures comprises ; c'est le régime
que décrivent les vérifications ci-dessous. Onglet PWA `#/planif` en
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
- [ ] **Cinq retouches PWA (2026-08-04)** : taguer une `agent-gw-vX.Y.Z` → image CI → bumper
      `image.tag` dans `alfred-helm.yml` (k8s-home-lab) → ArgoCD. À vérifier en vrai : le
      bandeau de nuit sur Baden, le tray avec beaucoup de suggestions, une fiche longue en
      pop-in, une bulle après rechargement, et **le scanner en rayon** (le seul dont le
      réglage — 3 lectures, fenêtre de 8 trames — se juge à la main, pas au test).
- [ ] **`app/static/launcher.js|css` sont des artefacts de build TRACKÉS et périmés** (dernier
      rafraîchissement : 8a673e9, alors que `frontend/src` a bougé quatre fois depuis). Ils ne
      servent rien en prod — le Dockerfile les écrase par le bundle de l'étape `frontend` —
      mais ils mentent à qui lit le dépôt. `engine.js`/`engine.css`/`scan.js` sont déjà
      ignorés : les deux-là ont été oubliés. `git rm --cached` + deux lignes de `.gitignore`.
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
