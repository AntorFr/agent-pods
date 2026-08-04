# Parcours — spec v1 (balades et randonnées)

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

## Hors v1

- Le bloc `{% parcours %}` et l'app-module carte (afficher la trace, le profil
  altimétrique, les repères cliquables) — la donnée est prête, le rendu non.
- La génération de boucle (« 8 km au départ d'ici ») : BRouter ne sait pas le
  faire, il faudrait GraphHopper.
- La lecture d'une trace importée (Wikiloc, Komoot).
