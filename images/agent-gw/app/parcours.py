"""Parcours — le GPX assemblé à la demande, jamais stocké.

Un parcours vit dans `…/assets/<nom>.parcours.json` (en git, frère de
`voyage.json`) et porte deux matières que rien ne doit mélanger :

- `reperes[]` : la prose d'Alfred — nom, description, note de contexte, lien,
  et les sources tierces (Google, OSM) datées, gardées séparées de sa parole.
  Il les corrige à la main quand il apprend quelque chose ;
- `trace` : la géométrie encodée et ses chiffres, écrits par `trace-geom` et
  par lui seul (le routeur est la source, pas le clavier d'un modèle).

Le `.gpx`, lui, n'est **pas** un fichier de la mémoire : c'est un DÉRIVÉ, monté
ici à chaque téléchargement. Deux raisons, dans cet ordre. D'abord ce qui se
commite doit être le fait — les repères rédigés et la géométrie mesurée — pas
son rendu ; ensuite un GPX figé se désynchronise de la fiche à la première
correction de description, et c'est exactement ce qui est arrivé à la boucle de
Vannes, cinq commits en vingt-quatre heures pour le même chemin.

Rien n'est écrit ici : ce module lit la mémoire et rend un fichier. La seule
entrée est un chemin, borné à l'union des magasins comme partout ailleurs.
"""

import json
import os
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

WORKSPACE = os.environ.get("GW_WORKSPACE", "/workspace")
MEMORY_DIR = os.environ.get("GW_MEMORY_DIR", "memory")

router = APIRouter(prefix="/api/parcours")


def _memory_roots() -> list[Path]:
    """Les racines de mémoire, dans l'ordre de précédence. Import paresseux :
    `app.main` charge ce module, un import de haut de fichier ferait un cycle."""
    try:
        from app.main import MEMORY_STORES  # noqa: PLC0415
        return [s["path"] for s in MEMORY_STORES]
    except Exception:
        return [(Path(WORKSPACE) / MEMORY_DIR).resolve()]


def _parcours_file(rel: str) -> Path:
    """Résout un `*.parcours.json` sur l'union des magasins, garde de traversée
    incluse. Le suffixe est vérifié plutôt que le seul chemin : cet endpoint ne
    doit pouvoir servir que des parcours, pas n'importe quel JSON de la mémoire."""
    for root in _memory_roots():
        p = (root / rel).resolve()
        if root in p.parents and p.name.endswith(".parcours.json") and p.is_file():
            return p
    raise HTTPException(status_code=404, detail="not a parcours")


def decode(encoded: str, factor: float = 1e5, dims: int = 2) -> list:
    """Polyline encodée -> valeurs. `dims=2` pour la trace (lat, lng),
    `dims=1, factor=1` pour la série d'altitudes, en mètres entiers."""
    out, i, acc = [], 0, [0] * dims
    while i < len(encoded):
        for d in range(dims):
            shift, result = 0, 0
            while i < len(encoded):
                b = ord(encoded[i]) - 63
                i += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            acc[d] += ~(result >> 1) if result & 1 else (result >> 1)
        out.append(tuple(v / factor for v in acc))
    return out


def _wpt(n: int, repere: dict) -> list[str]:
    """Un repère -> son `<wpt>`.

    Le `web` devient un vrai `<link>` GPX 1.1 : il survit dans Organic Maps ou
    OsmAnd, où il est cliquable. La note de contexte rejoint la description dans
    `<desc>` — un lecteur de GPX n'a qu'un champ, et perdre la note serait
    perdre précisément ce qu'Alfred a ajouté de sa main.
    """
    try:
        lat, lng = [x.strip() for x in str(repere.get("latlng", "")).split(",")]
        float(lat), float(lng)
    except (ValueError, TypeError):
        return []
    nom = repere.get("nom") or f"Repère {n}"
    morceaux = [repere.get("desc"), repere.get("note")]
    desc = "\n\n".join(m.strip() for m in morceaux if m and str(m).strip())
    out = [f'  <wpt lat={quoteattr(lat)} lon={quoteattr(lng)}>',
           f"    <name>{escape(f'{n}. {nom}')}</name>"]
    if desc:
        out.append(f"    <desc>{escape(desc)}</desc>")
    if repere.get("web"):
        out.append(f"    <link href={quoteattr(str(repere['web']))}>"
                   f"<text>{escape(nom)}</text></link>")
    if repere.get("sym"):
        out.append(f"    <sym>{escape(str(repere['sym']))}</sym>")
    out.append("  </wpt>")
    return out


def build_gpx(data: dict) -> str:
    """Le parcours -> un GPX 1.1 : les repères en `<wpt>`, le chemin en `<trk>`.

    ⚠️ La trace `<trk>` n'est pas décorative : beaucoup d'applications refusent
    d'afficher un fichier qui ne porte que des waypoints (constaté sur la boucle
    de Vannes). Un parcours sans géométrie calculée sort donc avec ses repères
    seuls, mais le dit dans sa description plutôt que de faire croire à un
    chemin qui n'a jamais été routé.
    """
    trace = data.get("trace") or {}
    reperes = data.get("reperes") or []
    titre = data.get("titre") or "Parcours"

    coords = decode(trace["geometrie"]) if trace.get("geometrie") else []
    altitudes = [v[0] for v in decode(trace["altitudes"], factor=1, dims=1)] \
        if trace.get("altitudes") else []

    if coords:
        km = (trace.get("distance_m") or 0) / 1000
        desc = (f"{km:.2f} km, {len(reperes)} repères, D+ {trace.get('denivele_pos_m', '?')} m. "
                f"Trace calculée le {trace.get('calcule_le', '?')} "
                f"({trace.get('moteur', 'routeur inconnu')}), "
                f"altimétrie {trace.get('altimetrie', 'inconnue')}.")
    else:
        desc = (f"{len(reperes)} repères. AUCUNE trace calculée : "
                f"ce fichier ne porte que des points, pas de chemin.")
    if data.get("desc"):
        desc = f"{data['desc']}\n\n{desc}"

    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<gpx version="1.1" creator="Alfred" xmlns="http://www.topografix.com/GPX/1/1"',
           '     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
           '     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 '
           'http://www.topografix.com/GPX/1/1/gpx.xsd">',
           "  <metadata>",
           f"    <name>{escape(titre)}</name>",
           f"    <desc>{escape(desc)}</desc>",
           "  </metadata>"]

    for n, repere in enumerate(reperes, start=1):
        out += _wpt(n, repere)

    if coords:
        out += ["  <trk>", f"    <name>{escape(titre)}</name>", "    <trkseg>"]
        for i, (lat, lng) in enumerate(coords):
            ele = f"<ele>{altitudes[i]:.0f}</ele>" if i < len(altitudes) else ""
            out.append(f'      <trkpt lat="{lat:.6f}" lon="{lng:.6f}">{ele}</trkpt>'
                       if ele else f'      <trkpt lat="{lat:.6f}" lon="{lng:.6f}"/>')
        out += ["    </trkseg>", "  </trk>"]

    out.append("</gpx>")
    return "\n".join(out) + "\n"


@router.get("/gpx")
async def parcours_gpx(f: str):
    """`GET /api/parcours/gpx?f=<chemin du .parcours.json>` -> le GPX assemblé."""
    p = _parcours_file(f)
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise HTTPException(status_code=422, detail=f"unreadable json: {p.name}")
    nom = p.name.replace(".parcours.json", ".gpx")
    return Response(
        content=build_gpx(data),
        media_type="application/gpx+xml",
        headers={"Content-Disposition": f'attachment; filename="{nom}"',
                 "Cache-Control": "no-store"},
    )
