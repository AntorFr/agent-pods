# Parcours — spec v1 (balades et randonnées)

> **Statut : LIVRÉ — ce document est une archive de conception.** Le code vit dans le
> plugin `parcours` (`plugins/parcours/`), avec `trace-geom` dans son `bin/`. Sorte
> **`socle`** et non `app` : un parcours est de la mémoire adressable, comme une fiche —
> il n'a ni tuile ni route propre, donc rien à éteindre.
>
> Le fichier de parcours et le GPX qu'on en dérive. Frère de `VOYAGES.md`, même
> patron : la donnée est en git, le rendu est calculé.

## La décision qui commande tout : deux matières, deux auteurs

Un parcours mélange deux choses que rien ne doit fondre ensemble.

| | Nature | Auteur | Ça bouge quand |
|---|---|---|---|
| `trace` | géométrie encodée + chiffres | **`trace-geom`**, jamais un humain ni un modèle | on ajoute, retire ou déplace un repère → on re-route |
| `reperes[]` | prose, notes, liens, sources | **Alfred**, à la main | dès qu'il apprend quelque chose → aucun recalcul |

D'où la propriété qui justifie la séparation : **corriger une description ne
recalcule rien.** La boucle de Vannes a coûté cinq commits en vingt-quatre
heures parce que le GPX portait les deux matières dans le même fichier, et que
toucher à l'une obligeait à réécrire l'autre.

Le corollaire est que le **`.gpx` n'est pas un fichier de la mémoire**. C'est un
dérivé, assemblé par `/api/parcours/gpx` à chaque téléchargement. Ce qui se
commite, c'est le fait — les repères rédigés et la géométrie mesurée — pas son
rendu.

## `…/assets/<nom>.parcours.json` — le contrat de données

```json
{
  "titre": "Vannes — boucle de la ville close",
  "profil": "pieton",
  "regime": "urbain",
  "desc": "Boucle au départ du parking du Port.",

  "trace": {
    "moteur": "BRouter / OpenStreetMap (profil hiking-beta)",
    "altimetrie": "routeur (BRouter)",
    "calcule_le": "2026-08-05",
    "distance_m": 3036, "denivele_pos_m": 30, "denivele_neg_m": 28,
    "duree_s": 2192, "points_trace": 328, "escaliers_m": 67,
    "revetement_m": { "pavés": 1298, "asphalte": 661 },
    "voies_m": { "chemin piéton": 1398, "escaliers": 67 },
    "geometrie": "polyline5 — lat,lng, précision 1e-5",
    "altitudes": "même algorithme, mètres entiers, facteur 1"
  },

  "reperes": [
    {
      "nom": "Bastion de Gréguennic",
      "latlng": "47.6545245,-2.7585968",
      "desc": "Bastion sud-ouest de l'enceinte, place de la Poissonnerie.",
      "note": "À 27 m de la trace : le point vise le bastion, la trace suit le quai.",
      "web": "https://…",
      "sym": "Monument",
      "sources": {
        "google": { "place_id": "ChIJ…", "note": 4.3, "avis": 27, "releve": "2026-08-04" },
        "osm":    { "id": "way/123", "historic": "citywalls", "releve": "2026-08-05" }
      },
      "ecart_trace_m": 27,
      "distance_precedent_m": 132
    }
  ]
}
```

**`desc` est la parole d'Alfred, `sources` est celle des autres.** Google donne
la note, le nombre d'avis, les horaires ; OSM donne le type exact, le site
officiel, le `wikipedia`. Chaque champ garde sa provenance et sa date de relevé,
parce que ces deux bases sont du **texte tiers** — celui d'OSM est même un wiki
éditable par n'importe qui, exactement comme Open Food Facts. On les cite, on ne
leur obéit pas, et on ne les fond jamais dans la prose d'Alfred. La corrélation
OSM ↔ Google est faillible : on garde les **deux** identifiants plutôt que de
trancher.

`ecart_trace_m` et `distance_precedent_m` sont écrits par `trace-geom`. L'écart
n'est pas cosmétique : à 27 m en ville, c'est le point qui vise le monument
pendant que la trace suit la voie ; à 300 m, c'est une coordonnée fausse — et
sans ce chiffre personne ne fait la différence.

## La chaîne

```
Alfred choisit les repères        search_places (maps, tourisme : notes et NOMBRE d'avis)
                                  trace_pois    (trace, marcheur : eau, vue, abri, GR)
        │
        ▼  il écrit reperes[] à la main dans le .parcours.json
        │
   trace-geom <fichier>           → hub rosetta /trace/geometrie (BRouter/OSM)
        │                           écrit `trace` + les écarts, rend les chiffres
        ▼
   /api/parcours/gpx?f=…          → le GPX assemblé, waypoints + <trk> + <ele>
```

**La géométrie ne traverse jamais la conversation.** Une balade de 3 km fait 328
points, une rando de 10 km en fait 519 : recopiés par un modèle, un caractère
perdu décale toute la fin du parcours, pour ~12 000 tokens dépensés deux fois.
`trace_calcule` rend les chiffres et une URL ; `trace-geom` va du hub au disque.

Vérifié de bout en bout le 2026-08-05 en refabriquant la boucle de Vannes
qu'Alfred avait tapée à la main : **19 repères et 328 points identiques, écart
maximal de 0,63 m** (l'arrondi de la polyline), et **328 balises `<ele>` là où
son fichier n'en portait aucune**.

## Ce que le GPX porte

Les repères en `<wpt>` numérotés — `desc` **et** `note` réunies dans `<desc>`
(un lecteur de GPX n'a qu'un champ, et perdre la note serait perdre exactement
ce qu'Alfred a ajouté de sa main), `web` en `<link>` cliquable dans Organic Maps
ou OsmAnd, `sym` tel quel. Puis le chemin en `<trk>/<trkseg>`, altitudes
comprises.

⚠️ La trace `<trk>` n'est pas décorative : beaucoup d'applications refusent
d'afficher un fichier qui ne porte que des waypoints. Un parcours pas encore
routé sort avec ses repères seuls, mais **l'annonce dans sa description** plutôt
que de laisser croire à un chemin.

## Où vit un parcours — nulle part en particulier, et c'est voulu

**Un parcours n'a pas de domaine.** Une balade n'est pas un pan de vie : c'est
une pièce jointe à quelque chose qui, lui, en est un. Elle vit dans les
`assets/` de la fiche qui a une raison d'en parler — un voyage, un week-end, un
lieu — et elle est **adressable toute seule** par `#/parcours/<chemin>`, qui lui
donne sa pleine page.

Un domaine `balades` dédié aurait forcé à trancher « la boucle de Vannes est-elle
un voyage ou une balade ? » — une question sans réponse, donc une mauvaise
question. Le chemin du fichier suffit à l'identifier ; la fiche qui la cite
suffit à la situer.

D'où les **deux vues** du bloc, un choix éditorial :

| | Quand |
|---|---|
| `vue="carte"` (défaut) | la balade **est** le sujet de la fiche |
| `vue="lien"` | la fiche parle d'autre chose et la cite au passage, ou en cite plusieurs |

Un même parcours peut être cité en lien depuis plusieurs fiches : un fichier,
plusieurs renvois — la non-duplication habituelle.

## Le rendu — `{% parcours source="…" /%}`

Le bloc pose une **ancre** (une `div` portant le chemin) ; `frontend/src/parcours.js`
va chercher le fichier et peint au montage. Carte, repères numérotés cliquables
reliés à la liste, profil altimétrique, bouton GPX. La route `#/parcours/…` monte
exactement le même bloc, seul dans son écran.

La carte se **déplace et se zoome** : glisser à la souris, molette avec Ctrl/⌘,
double-clic, boutons `+ − ⤢`, et deux doigts au tactile. Le geste tactile est
délibérément **partagé** — un doigt fait défiler la page, deux doigts pilotent
la carte. Prendre le doigt unique (`touch-action:none`, ce que fait Leaflet)
rendrait une fiche longue impossible à parcourir dès que le pouce tombe sur la
carte. Même logique à la molette : sans Ctrl/⌘, la page défile ; le pincement de
trackpad, lui, envoie `ctrlKey` de lui-même et zoome sans rien tenir.

**Sans bibliothèque de cartographie — et le pourquoi a changé en route.**
L'argument d'origine était « on regarde la forme d'une boucle, on ne l'explore
pas, donc pas besoin de zoom ». Il était honnête mais **conditionnel**, et la
condition est tombée le 2026-08-06 quand Monsieur a demandé le déplacement.
Ce qui reste, et qui suffit : Leaflet pèse ~150 ko bruts sur un bundle de 300
chargé pour **chaque** fiche, alors que la projection, la mosaïque et le tracé
étaient déjà écrits — il n'a manqué que l'inverse de la projection (pour zoomer
autour d'un point, il faut savoir quel lieu est sous le curseur) et trois
écouteurs. Coût total mesuré, gestes compris : **+11 ko sur `engine.js`**.

**Deux fonds, vérifiés vivants le 2026-08-05, gratuits et sans clé** : Plan IGN
(`data.geopf.fr`, WMTS `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`) et OpenStreetMap. Le
défaut se choisit sur la position — l'IGN ne couvre pas l'étranger, et une carte
vide serait une régression silencieuse. Un bouton bascule.

**L'invariant du moteur tient.** `chart.js` le pose : rien du contenu d'une
fiche ne s'exécute. Une passe de montage n'y déroge pas tant qu'elle **lit** la
donnée sans l'exécuter : pas un seul `innerHTML` porteur de contenu mémoire dans
`parcours.js` (tout passe par `textContent`), et la seule URL qu'un fichier peut
proposer — le `web` d'un repère — est filtrée sur `http`/`https`, parce qu'un
`javascript:` deviendrait du script au clic.

Deux détails qui ne se devinent pas : le profil altimétrique est **omis** sous
15 m d'amplitude (une courbe de bruit se lirait comme du relief), et un écart
repère ↔ trace n'est signalé qu'**au-delà de 60 m** — en deçà c'est le point qui
vise le lieu pendant que la trace suit la voie.

### Quatre défauts de LECTURE, corrigés le 2026-08-05

Tous constatés à l'usage sur la boucle de Vannes, aucun visible en relisant le
code :

1. **Le profil était tracé par INDICE de point, pas par distance.** Une trace
   routée est dense dans les virages et clairsemée en ligne droite : une épingle
   à cheveux occupait autant de largeur qu'un kilomètre de plat, et la pente
   affichée n'était pas la pente réelle. L'abscisse est désormais la distance
   cumulée. Il porte en plus ses **échelles** (altitudes bornantes, distances)
   et un **trait par repère**, numéroté quand il y a la place.
2. **Départ et arrivée étaient superposés.** Sur une boucle ils sont le même
   point : deux pastilles exactement l'une sur l'autre, et on ne savait plus par
   où l'on commence. Quand elles coïncident (moins de 18 px), une seule les
   porte — « 1·19 » — marquée départ. Les autres collisions s'écartent en
   éventail, avec un fil qui raccroche la pastille à son point réel.
3. **Un aller-retour se cachait sous lui-même.** Deux réponses cumulées : la
   ligne est **semi-opaque**, donc un tronçon parcouru deux fois fonce ; et des
   **chevrons orientés** tous les 90 px donnent le sens de marche — deux
   chevrons opposés sur la même rue disent « on y va et on en revient », ce
   qu'aucune épaisseur de trait ne peut dire.
4. **Le bouton GPX était en pied de page.** Il est sous la carte : on emporte la
   trace au moment où on la regarde, pas après avoir fait défiler dix-neuf
   descriptions.

Un repère peut porter son `picto` et sa `couleur` (une des 12 teintes). ⚠️ Le
picto vit dans **la liste seulement** : essayé sur les pastilles le 2026-08-06,
dix-neuf emojis sur une carte ne se distinguent pas les uns des autres. La
pastille garde son **numéro**, qui est de toute façon le seul lien entre elle et
sa description.

## Le mode balade — la carte sert en marchant

Bouton **🥾 Mode balade** sous la carte : plein écran, la position de Monsieur
dessus (point, **cercle de précision**, cap), le suivi qui recentre, et une
barre d'état qui dit les deux seules choses utiles à mi-parcours — *ce qui est
fait* et *ce qui vient* (« 1,24 km sur 3,04 km · → 7. La Cohue · 180 m »).
Le **wake lock** garde l'écran allumé, et se **reprend** au retour au premier
plan : il se perd dès que l'onglet passe derrière, sinon l'écran se rendort à la
première notification lue.

Trois limites qu'on ne contourne pas, écrites ici pour qu'elles ne se
découvrent pas sur le terrain :

- une page web **ne géolocalise pas en arrière-plan** — écran allumé, app au
  premier plan. Le wake lock règle le confort, pas la physique, et il mange la
  batterie ;
- dans une ville close, le GPS donne couramment **20 à 40 m**. D'où le cercle de
  précision : un point net sans son incertitude ferait croire à une exactitude
  qui n'existe pas ;
- **au-delà de 120 m de la trace, l'avancement ne veut plus rien dire** (le point
  le plus proche peut être n'importe où sur une boucle) : la barre le dit au lieu
  de rendre un chiffre faux.

## Emporter une balade — le hors-ligne

Bouton **⤓ Emporter** : les tuiles du parcours et son fichier passent dans un
cache que le service worker sert **cache d'abord**. Sur un sentier, un réseau
qui répond en dix secondes est pire que pas de réseau.

⚠️ **SEUL LE PLAN IGN EST EMPORTÉ, et c'est une limite du droit.** La politique
d'OpenStreetMap interdit le hors-ligne en toutes lettres — *« Offline use is not
permitted on tile.openstreetmap.org »* — et nomme le préchargement d'une zone
comme abus caractérisé. L'IGN ne l'interdit pas, n'affiche **aucun quota** sur la
diffusion WMTS, et publie en licence ouverte. Conséquence assumée : **hors de
France, pas de hors-ligne**, et le bouton n'apparaît même pas. Le garde-fou est
dans la page **et** dans le service worker.

⚠️ **Un corridor, pas une boîte englobante.** Sur une rando linéaire de 15 km, la
boîte est vide aux trois quarts — on tirerait des forêts qu'on ne verra jamais
chez un service public gratuit. Seules les tuiles qui touchent la trace, plus une
de marge. Mesuré : 69 tuiles contre 196 sur un tracé diagonal de 5 km.
Les requêtes partent **en série**, pas en rafale : on tire chez l'IGN, pas sur un
CDN qu'on paie.

Volume réel, boucle de Vannes, z15→z18 : **122 tuiles, ~5 Mo**. Ce n'est jamais
le poids qui pose problème.

⚠️ **iOS purge le stockage** d'un site après quelques jours sans visite. Une PWA
installée sur l'écran d'accueil est traitée plus généreusement, mais rien ne
garantit un téléchargement fait trois semaines avant : **emporter la veille**,
pas le mois d'avant.

Le service worker tient deux caches et deux régimes : la **coque** (l'app) en
*réseau d'abord* — une PWA qui sert son vieux JS après un déploiement est un bug
qu'on met des heures à comprendre — et la **balade** en *cache d'abord*. Tout le
reste (API, mémoire, chat) reste en réseau seul : servir une todo d'hier serait
pire que ne rien servir.

## Hors v1

- La génération de boucle (« 8 km au départ d'ici ») : BRouter ne sait pas le
  faire, il faudrait GraphHopper.
- Le hors-ligne hors de France : bloqué par la politique OSM, pas par le code.
- La lecture d'une trace importée (Wikiloc, Komoot).
