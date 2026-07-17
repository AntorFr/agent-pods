"""Voyages — app-module « planificateur de vacances » (spec : ../VOYAGES.md).

Trois familles d'endpoints, calquées sur le patron workbook :

- la DONNÉE (`…/assets/voyage.json`, écrite par Alfred, en git) est servie telle
  quelle via /api/memory/raw ; ici on ne fait que la lister et la valider ;
- les GESTES de la timeline (confirmer, déplacer, écarter) n'écrivent JAMAIS la
  mémoire : ils vont dans un overlay `voyage-state.json` frère — hors git, comme
  workbook-state.json — qu'Alfred consolide dans voyage.json à son prochain
  passage sur le dossier ;
- les DÉRIVÉS (météo par jour, liaisons entre cartes) sont calculés à la demande
  contre les API Google (même clé que le MCP maps, qui vit dans ce conteneur) et
  cachés en mémoire process — jamais écrits dans un fichier. Sans clé, on répond
  « indisponible » proprement : le front affiche l'absence, pas une fiction.
"""

import json
import os
import re
import time
from datetime import date, timedelta
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Request

WORKSPACE = os.environ.get("GW_WORKSPACE", "/workspace")
MEMORY_DIR = os.environ.get("GW_MEMORY_DIR", "memory")
# La même clé que mcp_servers/maps.py : le MCP tourne dans ce conteneur, la
# variable est déjà dans l'environnement du pod.
GOOGLE_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
TIMEOUT = 12.0

router = APIRouter(prefix="/api/voyage")

STATUTS = {"suggestion", "confirme", "ecartee"}
CRENEAUX = {"matin", "midi", "apres-midi", "soir"}
MODES_API = {"WALK", "DRIVE", "BICYCLE", "TRANSIT"}
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_LATLNG = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")


def _memory_root() -> Path:
    return (Path(WORKSPACE) / MEMORY_DIR).resolve()


def _voyage_file(rel: str) -> Path:
    root = _memory_root()
    p = (root / rel).resolve()
    if root not in p.parents or p.name != "voyage.json" or not p.is_file():
        raise HTTPException(status_code=404, detail="not a voyage")
    return p


def _load_json(p: Path) -> dict:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise HTTPException(status_code=422, detail=f"unreadable json: {p.name}")


def _load_v_state(vf: Path) -> dict:
    try:
        state = json.loads(vf.with_name("voyage-state.json").read_text())
    except (OSError, ValueError):
        state = {}
    state.setdefault("items", {})
    return state


def _merged_items(data: dict, state: dict) -> list[dict]:
    """Items de voyage.json, écrasés par l'overlay de gestes (statut/jour/creneau)."""
    out = []
    for it in data.get("items") or []:
        ov = state["items"].get(it.get("id") or "")
        out.append({**it, **{k: v for k, v in (ov or {}).items() if k != "ts"}})
    return out


@router.get("/list")
async def voyage_list():
    root = _memory_root()
    out = []
    if root.is_dir():
        for p in sorted(root.rglob("voyage.json")):
            rel = p.relative_to(root)
            if any(part.startswith(".") for part in rel.parts):
                continue
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            state = _load_v_state(p)
            items = _merged_items(data, state)
            ts = [o.get("ts") for o in state["items"].values() if o.get("ts")]
            out.append(
                {
                    "path": str(rel),
                    "titre": data.get("titre") or p.parent.parent.name,
                    "status": data.get("status"),
                    "debut": data.get("debut"),
                    "fin": data.get("fin"),
                    "lieux": [l.get("nom") for l in data.get("lieux") or [] if l.get("nom")],
                    "confirmes": sum(1 for i in items if i.get("statut") == "confirme"),
                    "suggestions": sum(1 for i in items if i.get("statut") == "suggestion"),
                    "lastActivity": max(ts, default=None),
                }
            )
    # Les voyages à venir/en cours d'abord (par date de début), les idées ensuite.
    out.sort(key=lambda v: (v["debut"] is None, v["debut"] or "", v["titre"]))
    return {"voyages": out}


@router.get("/state")
async def voyage_state(v: str):
    return _load_v_state(_voyage_file(v))


@router.post("/state")
async def voyage_gesture(request: Request):
    """Un geste = un item. Merge côté serveur (deux appareils ne s'écrasent pas),
    validé contre voyage.json : l'overlay ne peut pas inventer d'item ni de date
    hors du voyage. Alfred consolide l'overlay dans voyage.json, puis le vide."""
    body = await request.json()
    vf = _voyage_file(body.get("v") or "")
    data = _load_json(vf)
    item_id = (body.get("id") or "").strip()
    base = next((i for i in data.get("items") or [] if i.get("id") == item_id), None)
    if not base:
        raise HTTPException(status_code=400, detail="unknown item")
    if base.get("debut") or base.get("fin"):
        raise HTTPException(status_code=400, detail="continuous items are not movable")
    statut = body.get("statut")
    if statut not in STATUTS:
        raise HTTPException(status_code=400, detail="bad statut")
    ov: dict = {"statut": statut, "ts": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    if statut == "confirme":
        jour = body.get("jour") or ""
        if not _DATE.match(jour):
            raise HTTPException(status_code=400, detail="confirme requires jour")
        deb, fin = data.get("debut"), data.get("fin")
        if not deb or not fin:
            # Voyage « idée » : rien ne se confirme tant que les dates ne sont pas posées.
            raise HTTPException(status_code=400, detail="voyage has no dates yet")
        if not (deb <= jour <= fin):
            raise HTTPException(status_code=400, detail="jour outside voyage")
        ov["jour"] = jour
        creneau = body.get("creneau")
        if creneau is not None:
            if creneau not in CRENEAUX:
                raise HTTPException(status_code=400, detail="bad creneau")
            ov["creneau"] = creneau
    state = _load_v_state(vf)
    state["items"][item_id] = ov
    vf.with_name("voyage-state.json").write_text(
        json.dumps(state, ensure_ascii=False, indent=1)
    )
    return state


# ── Dérivés (météo, liaisons) — cache process, jamais de fichier ──────────────

_cache: dict[tuple, tuple[float, dict]] = {}


def _cached(key: tuple, ttl: float):
    hit = _cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    return None


def _remember(key: tuple, ttl: float, value: dict) -> dict:
    _cache[key] = (time.time() + ttl, value)
    if len(_cache) > 512:  # borne dure, un voyage n'en génère que quelques dizaines
        for k in sorted(_cache, key=lambda k: _cache[k][0])[:128]:
            _cache.pop(k, None)
    return value


def _day_location(data: dict, d: str) -> tuple[float, float] | None:
    """Le lieu du jour, dérivé des données : hébergement actif ce jour-là, sinon
    l'étape courante (fenêtres arrivee/depart des lieux), sinon le premier lieu."""
    for it in data.get("items") or []:
        if (
            it.get("type") == "hebergement"
            and it.get("statut") == "confirme"
            and it.get("debut") and it.get("fin")
            and it["debut"] <= d < it["fin"]
            and it.get("lat") is not None
        ):
            return (it["lat"], it["lng"])
    for l in data.get("lieux") or []:
        if l.get("lat") is None:
            continue
        if (l.get("arrivee") or "0000") <= d <= (l.get("depart") or "9999"):
            return (l["lat"], l["lng"])
    for l in data.get("lieux") or []:
        if l.get("lat") is not None:
            return (l["lat"], l["lng"])
    return None


async def _forecast(lat: float, lng: float) -> dict:
    """10 jours de prévisions pour un point, indexées par date ISO. Cache 1 h."""
    key = ("wx", round(lat, 3), round(lng, 3))
    if hit := _cached(key, 3600):
        return hit
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.get(
            "https://weather.googleapis.com/v1/forecast/days:lookup",
            params={"key": GOOGLE_KEY, "location.latitude": lat, "location.longitude": lng,
                    "days": 10, "unitsSystem": "METRIC", "languageCode": "fr"},
        )
        data = r.json()
    if r.status_code != 200:
        return {}  # pas de cache : erreur transitoire ≠ absence de prévision
    days = {}
    for fd in data.get("forecastDays") or []:
        disp = fd.get("displayDate") or {}
        if not disp.get("year"):
            continue
        iso = f"{disp['year']}-{disp['month']:02d}-{disp['day']:02d}"
        cond = ((fd.get("daytimeForecast") or {}).get("weatherCondition")) or {}
        days[iso] = {
            "type": cond.get("type"),
            "desc": ((cond.get("description") or {}).get("text")),
            "tmax": ((fd.get("maxTemperature") or {}).get("degrees")),
            "tmin": ((fd.get("minTemperature") or {}).get("degrees")),
        }
    return _remember(key, 3600, days)


@router.get("/weather")
async def voyage_weather(v: str):
    """Un picto par jour du voyage, fenêtre fiable seulement (aujourd'hui → J+9,
    limite de l'API). Le lieu de chaque jour est dérivé des données ; hors
    fenêtre ou sans clé, le jour est simplement absent de la réponse."""
    if not GOOGLE_KEY:
        return {"available": False, "days": {}}
    data = _load_json(_voyage_file(v))
    deb, fin = data.get("debut"), data.get("fin")
    if not deb or not fin:
        return {"available": True, "days": {}}
    today = date.today()
    out = {}
    d = max(date.fromisoformat(deb), today)
    end = min(date.fromisoformat(fin), today + timedelta(days=9))
    while d <= end:
        iso = d.isoformat()
        loc = _day_location(data, iso)
        if loc:
            wx = await _forecast(*loc)
            if iso in wx:
                out[iso] = wx[iso]
        d += timedelta(days=1)
    return {"available": True, "days": out}


@router.get("/route")
async def voyage_route(frm: str, to: str, mode: str = "WALK"):
    """Durée/distance entre deux cartes (liaison). Sans trafic — l'approximation
    est le contrat des vacances — donc cacheable longtemps (24 h)."""
    if not GOOGLE_KEY:
        return {"available": False}
    mode = mode.upper()
    m1, m2 = _LATLNG.match(frm or ""), _LATLNG.match(to or "")
    if not m1 or not m2 or mode not in MODES_API:
        raise HTTPException(status_code=400, detail="frm/to must be lat,lng; bad mode")
    a = (round(float(m1.group(1)), 4), round(float(m1.group(2)), 4))
    b = (round(float(m2.group(1)), 4), round(float(m2.group(2)), 4))
    key = ("route", a, b, mode)
    if hit := _cached(key, 86400):
        return hit
    body = {
        "origin": {"location": {"latLng": {"latitude": a[0], "longitude": a[1]}}},
        "destination": {"location": {"latLng": {"latitude": b[0], "longitude": b[1]}}},
        "travelMode": mode,
        "languageCode": "fr",
    }
    if mode == "DRIVE":
        body["routingPreference"] = "TRAFFIC_UNAWARE"
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(
            "https://routes.googleapis.com/directions/v2:computeRoutes",
            headers={
                "X-Goog-Api-Key": GOOGLE_KEY,
                "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
                "Content-Type": "application/json",
            },
            json=body,
        )
        data = r.json()
    routes = (data.get("routes") or []) if r.status_code == 200 else []
    if not routes:
        return {"available": False}
    top = routes[0]
    seconds = int(str(top.get("duration") or "0s").rstrip("s"))
    return _remember(
        key, 86400,
        {"available": True, "seconds": seconds, "meters": top.get("distanceMeters") or 0},
    )
