# Workbook 3.0 — le contrat refondu

> **Statut : ACTÉ le 2026-08-17.** Les trois arbitrages ⚖️ sont tranchés par Monsieur :
> **1. oui** (`rot` inversé), **2. oui** (chants renommés), **3. minimale** — et un
> amendement : **seul `imp3d` migre en fichier** (le projet actif). Le claustra et le
> garage restent en 2.0 sur disque ; le convertisseur au chargement devient le chemin de
> compatibilité **durable** des livres dormants (un module, pas un second moteur de rendu),
> et le § 4.4 (mort du convertisseur) est abandonné.
>
> Une fois acté, ce document se distille dans la skill `atelier:workbook-json` (le contrat
> pour agents) et meurt ici en archive de conception.

## 0. Ce qui ne change PAS (les fondations saines)

- **Un `workbook.json` par projet, source de vérité unique**, détecté par convention
  (`…/assets/workbook.json`), rendu par le front sans déclaration nulle part.
- **La frontière des gestes** : le front n'écrit jamais la mémoire. L'avancement
  (`workbook-state.json`) et le calepinage remanié (`workbook-layout.json`) vivent à côté,
  hors git ; Alfred consolide sur demande.
- **Le modèle enchaîné du débit** : `entree` = `"plaque"` | id de bande | id d'étape de
  tronçonnage. Dégrossissage, orientations mixtes, deux-pièces-en-travers.
- **La scène ouverte d'assemblage (v0.2)** : primitives fermées, cotes mesurées jamais
  écrites, séquence cochable. Elle devient le SEUL format d'assemblage.
- **`stations[]`** : la barre déclarée, zéro ou plusieurs fois chaque type.
- **Les vocabulaires fermés** et le validateur comme discipline.

## 1. Les cinq décisions de la refonte

### D1 — UN repère par pièce, et tout s'exprime dedans

**Le mal à guérir** : quatre bugs en un mois, tous nés du même flou — `longueur`/`largeur`
qui changent de sens selon le rôle, des chants définis par rapport à un dessin, un `w`
lamello défini par rapport à un bord, et des axes de rendu choisis par une heuristique sur
le texte du rôle (`role === 'CÔTÉ'` — qui ignore vos `SÉPARATEUR`, `TRAV-AV`…).

**La règle 3.0** : chaque pièce porte un repère local, unique, indépendant du rôle et du
dessin :

```
u : de 0 à `longueur`  — u=0 est l'ABOUT GAUCHE, u=longueur l'ABOUT DROIT
v : de 0 à `largeur`   — v=0 est la RIVE AVANT,  v=largeur la RIVE ARRIÈRE
faces : `face` (dessus dans le repère) et `contre-face`
```

Les six surfaces ont UN nom, partagé par tout le contrat :
`face` · `contre-face` · `rive-avant` · `rive-arriere` · `about-gauche` · `about-droit`
(+ le sucre `abouts` = les deux abouts).

- `chants[]` utilise CE vocabulaire (fini `avant`/`gauche` définis « comme en vue
  Tronçons » — la vue n'a plus rien à dire au modèle).
- `sur` des préparations : le même.
- Toute position d'usinage est un point `(u, v)` dans ce repère.
- **Le rôle redevient un libellé.** Aucun comportement, nulle part, ne dépend de son texte.
- Les dessins dérivent du repère par transformation explicite ; « quelle arête est en haut »
  est un problème de RENDU, résolu une fois dans une fonction, plus jamais dans la donnée.

### D2 — Une bande est un rectangle + un axe

**Le mal** : `largeur` + `longueur` + `sens: court|long` a exigé un tableau au contrat et un
correcteur (`bandBox`) au front.

**La règle 3.0** :

```json
{ "id": "P1-B1", "label": "B1", "x": 0, "y": 0, "w": 310, "h": 1000, "axe": "y" }
```

`x,y,w,h` : le rectangle sur la plaque, point. `axe` : l'axe le long duquel courent les
tronçons (`"y"` = bande debout, `"x"` = couchée). Le réglage du guide n'est plus un champ :
c'est **la dimension transverse** (`axe==="y"` → `w`), donc il ne peut pas mentir.

Une pose reste `{ etiquette, x, y, rot }`. ⚖️ **Arbitrage rot** : en 3.0, `rot: false`
signifie « la pièce est posée comme elle se dessine » — **u (longueur) le long de x**.
C'est l'inverse du défaut 2.0 (largeur en x, hérité des bandes debout). Plus intuitif,
converti mécaniquement — mais c'est une inversion silencieuse si on lit un vieux fichier
avec les yeux de 3.0. Je recommande l'inversion + le champ `schemaVersion` qui tranche.

### D3 — Une seule écriture par concept (lamello unifié)

**Le mal** : trois formes (`niveaux`, produit croisé, lignes-objets), un produit croisé qui
ne sait pas faire varier le type, `niveaux` ignoré sur les pièces horizontales, et des
positions dont l'axe dépend du rôle.

**La règle 3.0** : une préparation = une surface + des lignes ; une ligne fixe UNE
coordonnée du repère, ses points donnent l'autre :

```json
{ "type": "lamello", "sur": "face",
  "lignes": [
    { "v": 50,  "points": [ {"u": 9.5, "t": "tenso"}, {"u": 360, "t": "tenso"}, {"u": 710.5, "t": "tenso"} ] },
    { "v": 335, "points": [ {"u": 9.5, "t": "biscuit"}, {"u": 360, "t": "biscuit"}, {"u": 710.5, "t": "biscuit"} ] },
    { "v": 620, "points": [ {"u": 9.5, "t": "tenso"}, {"u": 360, "t": "tenso"}, {"u": 710.5, "t": "tenso"} ] } ] }
```

- La clé de la ligne (`u:` ou `v:`) NOMME l'axe fixé — plus d'ambiguïté possible, et les
  deux orientations de lignes existent sur toute surface.
- Sur un about, `u` est imposé par le bout → les points ne portent que `v` (et
  réciproquement sur une rive). Le validateur refuse la coordonnée qui n'a pas de sens.
- Le sucre « mêmes connecteurs sur plusieurs lignes » disparaît : neuf points s'écrivent
  neuf fois. C'est voulu — le sucre a coûté plus cher qu'il n'a économisé de frappe, et
  c'est l'agent qui écrit, pas un humain.
- `ref` (référence de cotation) disparaît : le repère EST la référence. `note` reste.
- Le lamello de votre BAS (l'exemple ci-dessus) : une préparation, trois lignes, types
  mêlés — ce qui a demandé trois préparations en 2.0.

### D4 — Les règles écrites UNE fois, livrées avec l'image

**Le mal** : trait de scie, zone utile, chevauchements, chaîne des `entree` — écrits trois
fois (validateur du workspace, `wbIssues` du front, prose du contrat), déjà divergés une
fois (le claustra refusé à tort pendant des semaines).

**La règle 3.0** : un module unique `regles.js` dans le plugin atelier de l'image :
- **bundlé dans le front** → l'établi applique exactement les règles officielles ;
- **exposé en CLI** (`plugins/atelier/tools/valide.mjs`) → Alfred valide avec le même code ;
- le validateur du workspace d'Alfred devient un lanceur mince (il appelle celui de
  l'image) puis disparaît.

Même principe que `fiches-format` : le contrat descend avec le code qui le lit.

### D5 — Le poids mort part au feu

| À supprimer | Pourquoi |
|---|---|
| `calepinage[]` (schéma 1.0) + son rendu | plus aucun fichier ne l'utilise |
| `reglageFS`, `panneau`, `colonne` sur les pièces | doublons de `debit[]` — Alfred les remplit encore par mimétisme du contrat, sur un projet créé hier |
| L'ancienne UI (`app/static/index.html`) | déjà marquée « à retirer », toujours servie |
| L'élévation d'assemblage héritée | remplacée par la scène ; le convertisseur fabrique une scène minimale depuis les vieux `niveaux`/`sequence` |
| Les identifiants « déduits » (`id.split('-').pop()`) | chaque bande/étape porte un `label` explicite |

## 2. Le squelette 3.0 complet

```jsonc
{
  "schemaVersion": "3.0",
  "projet": "IMP", "titre": "…", "note": "…",
  "materiaux": [ { "id": "MEL19", "label": "…", "ep": 19,
                   "plaque": { "l": 2800, "h": 2070 }, "derasage": 50,
                   "decorUni": true, "sensFil": "libre" } ],
  "meta": { "kerf": 4, "tronconnage": 10, "chant": "résumé libre", "installation": "…" },

  "pieces": [
    { "etiquette": "IMP-C1-BAS", "module": "C1", "role": "BAS", // rôle = libellé, rien d'autre
      "longueur": 720, "largeur": 670, "materiau": "MEL19",     // ep vient du matériau
      "chants": ["rive-avant"],
      "preparations": [ /* D3 */ ] } ],

  "debit": [
    { "plaque": "P1", "label": "La chute", "materiau": "MEL19",
      "etapes": [
        { "id": "P1-e1", "type": "refente", "entree": "plaque", "label": "Refendre à 668",
          "bandes": [ { "id": "P1-B1", "label": "B1", "x": 0, "y": 0, "w": 668, "h": 2800, "axe": "y" } ] },
        { "id": "P1-e2", "type": "tronconnage", "entree": "P1-B1", "label": "Tronçonner B1",
          "pieces": [ { "etiquette": "IMP-C1-CÔTÉ-G", "x": 0, "y": 0, "rot": false } ] },
        { "id": "P1-e3", "type": "refente", "entree": "P1-e2", "label": "Déligner …" } ] } ],

  "stations": [ /* inchangé */ ],
  "assemblage": [ /* scène v0.2 uniquement */ ]
}
```

Petits arrêtés au passage : `materiau` remonte sur la pièce (l'épaisseur vient de lui — fini
le `ep` recopié à la main) ; `derasage` reste une propriété du matériau et une étape
cochable ; les clés d'avancement sont les `id` d'étapes, **préservés par la migration** pour
que rien de coché ne se perde.

## 3. L'échelle d'affichage — la politique, écrite

Principe de Monsieur, appliqué partout : **un seul px/mm par workbook à l'écran**. Le front
calcule une largeur de référence globale (le plus grand objet dessiné, toutes vues
confondues) et TOUTES les vues — Plaques, Tronçons, Lamello, Assemblage — composent leur
viewBox dessus. Une tablette de 331,5 a la même taille dans les quatre onglets. Le plafond
d'étirement (×2 du naturel) devient lui aussi global. Jamais de zoom local ; la lisibilité
des petits objets passe par les cotes écrites, pas par la loupe.

## 4. La migration — une passe, pas un fil de l'eau

1. **`migre.mjs` livré avec l'image**, à côté de `valide.mjs` : lit un 2.0 (ou 1.0), écrit
   le 3.0 — repère traduit, bandes en rectangles, lamello unifié, champs morts supprimés,
   `id` d'étapes préservés, élévation héritée → scène minimale (le côté en rect, les niveaux
   en traits cotés, la séquence en étapes v0.2).
2. **Le front embarque le MÊME convertisseur** : un fichier 2.0 est converti en mémoire au
   chargement. Un seul chemin de rendu (3.0), zéro double code — la compatibilité de
   transition est le convertisseur, pas un deuxième moteur.
3. **Alfred migre les trois livres** en une passe (le convertisseur fait foi, il relit et
   commite), le jour de la release.
4. **Une version plus tard**, la conversion au chargement disparaît. Pas de 2.0 toléré à vie.

## 5. ⚖️ Les trois arbitrages de Monsieur

1. **`rot` inversé** (u le long de x par défaut) — recommandé : oui. C'est le sens de
   lecture naturel, et le convertisseur absorbe l'inversion.
2. **Renommage des chants** (`avant` → `rive-avant`, etc.) — recommandé : oui. C'est LE
   vocabulaire unique du repère ; garder les anciens noms maintiendrait deux dialectes.
3. **Scènes des anciens projets** : le convertisseur fabrique une scène minimale pour le
   claustra (clos — l'historique reste lisible) et le garage. Suffisant, ou voulez-vous
   qu'Alfred redessine une vraie scène pour le garage ? Recommandé : minimale pour les
   deux, une vraie scène le jour où le garage rebouge.

## 8. D8 — `jonctions[]`, l'objet de premier rang (acté 2026-08-17)

**Le mal, en trois symptômes d'une seule cause.** Une jonction s'usine sur DEUX pièces, mais
elle s'écrivait deux fois, indépendamment, sans rien qui les relie. D'où, en une seule
journée : sept jonctions **déclarées d'un seul bord** (rien ne le détectait) ; deux moitiés
qui **peuvent porter des cotes divergentes** (déjà vécu : fentes décalées de 9 et 19 mm) ;
et un **`appui` qui peut contredire le `depuis`** d'en face (rien ne le vérifie).

**La règle 3.1** : la jonction devient la source, les préparations en **dérivent**.

```jsonc
{ "id": "J-bas-coteG",
  "porte":  { "piece": "IMP-C1-BAS", "sur": "face",
              "pos": 0, "depuis": "about-gauche" },   // le sabot : où arrive la planche
  "arrive": { "piece": "IMP-C1-CÔTÉ-G", "sur": "about-gauche",
              "appui": "face", "origine": 0 },        // l'établi + le décalage de repère
  "connecteurs": [ { "t": "tenso", "a": 50 },
                   { "t": "biscuit", "a": 335 },
                   { "t": "tenso", "a": 620 } ] }
```

- **`porte`** — la pièce qui reçoit sur sa face. `pos`/`depuis` = la cote au sabot (D6).
- **`arrive`** — la pièce qui arrive par son chant. `appui` = la face couchée sur l'établi (D7).
- **`connecteurs[].a`** — la position **le long de la jonction**, dans le repère de la
  PORTEUSE. Écrite **une seule fois** : les deux moitiés ne peuvent plus diverger.
- **`arrive.origine`** — la coordonnée, chez la porteuse, du zéro de l'arrivante. La position
  chez l'arrivante vaut `a − origine`. Défaut 0 (le cas courant : même origine physique).
  C'est ce nombre qui capture le cas réel de la traverse arrière — 601 chez le côté, 50 chez
  elle, donc `origine: 551`. Sans lui, on recopie 50 et les fentes ratent de 551 mm.
- **`arrive.inverse`** — repère à contresens (rare, symétries) : `a` compté depuis l'autre bout.

**L'axe se déduit, il ne se déclare pas** : `depuis` nomme un bord, donc la ligne de la
porteuse court sur l'axe perpendiculaire, et les `a` tombent sur l'axe restant. Même règle
pour l'arrivante selon son chant (about → `v`, rive → `u`). Zéro ambiguïté, zéro transposition
possible — la maladie du 2.0 ne peut plus revenir par cette porte.

**Ce que le validateur gagne** (et qui était impossible avant) : les deux pièces existent ;
les deux surfaces sont du bon genre (une face porte, un chant arrive) ; chaque point tombe
dans les DEUX pièces ; `appui` est présent sur l'arrivante. Une jonction ne peut plus être
à moitié écrite, puisqu'elle est écrite d'un bloc.

**Cohabitation** : `preparations[]` reste pour l'usinage qui n'est PAS une jonction (rainure,
perçage) et pour les livres pas encore migrés. Les préparations dérivées des jonctions
s'ajoutent aux préparations écrites à la main — le rendu et le suivi ne voient que la somme.

## 7. Amendements post-livraison (2026-08-17)

- **D6 — Le sabot.** Une ligne lamello de face décrit **où arrive la planche voisine**, pas
  l'axe des fentes : `pos` = distance du bord de référence à sa face la plus proche (butée
  = 0), + `ep` et `depuis`. La fente tombe au milieu de la bande. Corrige une lecture qui
  aurait fait fraiser à ép/2 près.
- **D7 — `haut`.** La surface qui regarde le plafond une fois monté ; non déductible du débit.
- **L'échelle, jusqu'au bout.** `min-width:480px` sur les SVG remontait de force les petits
  dessins (une plaque de 700 rendait au DOUBLE d'une de 2800) et la scène d'assemblage,
  partagée avec sa séquence, tournait à la moitié. Chaque carte porte désormais un viewBox
  à sa taille réelle et une largeur CSS proportionnelle : px/mm identique partout, sans
  espace mort. Mesuré carte par carte : 0,267 sur les quatre vues.
- **Une échelle typographique** (`FS`), trois niveaux, partagée par les quatre vues.

## 6. Ordre de chantier (après votre relecture)

1. `regles.js` + `valide.mjs` + `migre.mjs` (le socle, testable sans front).
2. Le front : repère unique, rendu 3.0, conversion au chargement, échelle globale.
3. Suppression : 1.0, ancienne UI, élévation héritée, heuristiques de rôle.
4. Contrat : réécriture de `atelier:workbook-json` (il rétrécit — bon signe).
5. Alfred : migration des trois livres, validateur du workspace → lanceur mince.
6. Une version après : mort du convertisseur au chargement.
