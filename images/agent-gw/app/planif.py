"""Planif — tâches planifiées d'Alfred (spec cerveau : DECISIONS.md D30).

Une planification est une fiche `type: planif` de la mémoire (`memory/planif/*.md`,
en git, écrite par Alfred seul) dont le **CORPS EST L'INSTRUCTION** : à l'heure dite,
on ouvre un tour Alfred ordinaire avec ce texte pour prompt. Ce qu'on lit dans la
fiche est mot pour mot ce qui tourne — pas de prompt caché à côté d'une description.

Trois partis pris qui expliquent le code :

1. **On matche la minute courante, on ne calcule pas la prochaine échéance.**
   Un cron « 0 3 * * * » en Europe/Paris doit tomber à 3 h locales, y compris le
   dimanche où 3 h existe deux fois (ou pas du tout). Comparer l'heure LOCALE au
   masque cron fait ça correctement et sans arithmétique de fuseau ; calculer un
   `next_run` en UTC ne le fait qu'au prix d'un tas de cas particuliers. Le prix :
   un tour manqué n'est PAS rattrapé au-delà de la fenêtre de grâce — ce qui est
   très exactement ce que D30 demande (un pod qui redémarre ne rejoue pas 12 h).

2. **La fenêtre de grâce, pas le rattrapage.** Le tick est court (30 s) mais un tour
   Alfred peut durer des minutes et il tient `_query_lock`. On regarde donc les
   `GRACE` dernières minutes et on déclenche la plus récente non encore honorée.
   Au-delà, c'est perdu, et c'est voulu.

3. **`GW_CHANNEL=planif` est passé au SDK par `options.env`** (vérifié : le SDK
   FUSIONNE ce dict par-dessus l'environnement hérité, le token OAuth survit). Le
   hook `google_guard.py` du workspace lit cette variable et ferme TOUTE la surface
   Google sur ce canal, lectures comprises : personne n'est là pour armer le
   bouclier, et un mail hostile lu sans témoin puis résumé dans memory/ blanchirait
   du contenu non fiable en mémoire de confiance.

Le journal d'exécution va dans `planif/planif-state.json` — hors git, éphémère pur,
comme workbook-state.json et todo-state.json. La gateway n'écrit JAMAIS memory/.
"""

import asyncio
import json
import os
import re
import traceback
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter

WORKSPACE = os.environ.get("GW_WORKSPACE", "/workspace")
MEMORY_DIR = os.environ.get("GW_MEMORY_DIR", "memory")
PLANIF_DIR = os.environ.get("GW_PLANIF_DIR", "planif")
STATE_NAME = "planif-state.json"
DEFAULT_TZ = os.environ.get("GW_PLANIF_TZ", "Europe/Paris")
# Période du tick. Doit rester < 60 s pour ne pas sauter de minute en régime normal.
TICK = int(os.environ.get("GW_PLANIF_TICK", "30"))
# Fenêtre de rattrapage, en minutes. Couvre un tour long qui a tenu le verrou ; pas
# une panne. 0 désactive tout rattrapage (seule la minute courante compte).
GRACE = int(os.environ.get("GW_PLANIF_GRACE", "5"))
# Garde-fou de coût : un tour planifié qui part en boucle ne doit pas manger la nuit.
TIMEOUT = int(os.environ.get("GW_PLANIF_TIMEOUT", "900"))
# Plancher de fréquence (minutes). Un cron plus fin est REFUSÉ au chargement plutôt
# que d'être silencieusement lissé : mieux vaut une fiche visiblement invalide qu'un
# quota d'abonnement mangé par un « */1 » posé sans y penser.
MIN_PERIOD = int(os.environ.get("GW_PLANIF_MIN_PERIOD", "15"))
JOURNAL_KEEP = 20

router = APIRouter(prefix="/api/planif")

_FIELD_RANGES = ((0, 59), (0, 23), (1, 31), (1, 12), (0, 7))  # min h dom mon dow


def _memory_root() -> Path:
    return (Path(WORKSPACE) / MEMORY_DIR).resolve()


def _planif_root() -> Path:
    return _memory_root() / PLANIF_DIR


def _state_path() -> Path:
    return _planif_root() / STATE_NAME


# --- Cron ------------------------------------------------------------------


def _parse_field(spec: str, lo: int, hi: int) -> set[int]:
    """Un champ cron -> l'ensemble des valeurs qu'il couvre.

    Supporte `*`, `a`, `a-b`, `*/n`, `a-b/n` et les listes `a,b-c`. Volontairement
    numérique : pas de `mon`/`jan`, pas de `@daily`, pas de `L`/`#`. Le contrat
    d'écriture (skill `redaction`) dit « cron 5 champs » — on n'invente rien de plus,
    et une syntaxe inconnue lève plutôt que de matcher trop large.
    """
    out: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            raise ValueError("champ vide")
        step = 1
        if "/" in part:
            part, _, s = part.partition("/")
            if not s.isdigit() or int(s) < 1:
                raise ValueError("pas invalide : %r" % s)
            step = int(s)
        if part == "*":
            start, end = lo, hi
        elif "-" in part.lstrip("-"):
            a, _, b = part.partition("-")
            if not (a.isdigit() and b.isdigit()):
                raise ValueError("intervalle invalide : %r" % part)
            start, end = int(a), int(b)
        elif part.isdigit():
            start = end = int(part)
        else:
            raise ValueError("terme invalide : %r" % part)
        if start < lo or end > hi or start > end:
            raise ValueError("hors bornes : %r" % part)
        out.update(range(start, end + 1, step))
    return out


def parse_cron(expr: str) -> list[set[int]]:
    """« m h dom mon dow » -> 5 ensembles. Lève ValueError sur toute autre forme."""
    fields = (expr or "").split()
    if len(fields) != 5:
        raise ValueError("cron à 5 champs attendu, reçu %d" % len(fields))
    sets = [_parse_field(f, lo, hi) for f, (lo, hi) in zip(fields, _FIELD_RANGES)]
    if 7 in sets[4]:  # dimanche s'écrit 0 ou 7 ; on normalise sur 0
        sets[4] = (sets[4] - {7}) | {0}
    return sets


def cron_period_minutes(sets: list[set[int]]) -> int:
    """Écart minimal (minutes) entre deux déclenchements — pour le plancher.

    Approximation volontairement grossière et PRUDENTE : on ne regarde que les deux
    champs qui peuvent produire du sous-horaire (minutes, heures). Elle sous-estime
    parfois la période réelle (jamais l'inverse), donc elle ne laisse jamais passer
    un cron trop fréquent.
    """
    mins = sorted(sets[0])
    if len(mins) > 1:
        gaps = [b - a for a, b in zip(mins, mins[1:])] + [60 - mins[-1] + mins[0]]
        return min(gaps)
    return 60 if len(sets[1]) > 1 else 24 * 60


def cron_match(sets: list[set[int]], dt: datetime) -> bool:
    """Vrai si `dt` (heure LOCALE de la fiche) tombe sur le masque.

    Sémantique cron historique sur jour-du-mois / jour-de-semaine : si les DEUX sont
    restreints, c'est un OU (« le 1er du mois OU le lundi »), pas un ET.
    """
    dom_r = sets[2] != set(range(1, 32))
    dow_r = sets[4] != set(range(0, 7))
    day = (
        (dt.day in sets[2] or dt.isoweekday() % 7 in sets[4])
        if (dom_r and dow_r)
        else (dt.day in sets[2] and dt.isoweekday() % 7 in sets[4])
    )
    return dt.minute in sets[0] and dt.hour in sets[1] and dt.month in sets[3] and day


# --- Fiches ----------------------------------------------------------------


def _parse_fiche(path: Path) -> dict | None:
    """Lit une fiche planif. Renvoie None si ce n'en est pas une.

    On refait ici une lecture de frontmatter minimale plutôt que d'importer celle de
    main.py : ce module doit rester utilisable sans monter toute l'app (tests), et le
    corps — l'instruction — n'est justement PAS exposé par /api/memory/index.
    """
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end < 0:
        return None
    fm: dict = {}
    for line in text[3:end].split("\n"):
        m = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if m:
            fm[m.group(1)] = m.group(2).strip().strip("\"'")
    if fm.get("type") != "planif":
        return None
    body = text[end + 4 :].strip()
    actif = str(fm.get("actif", "true")).lower() not in ("false", "no", "0", "")
    item = {
        "id": path.stem,
        "path": str(path.relative_to(_memory_root())),
        "titre": fm.get("titre") or path.stem.replace("-", " ").capitalize(),
        "quand": fm.get("quand", ""),
        "tz": fm.get("tz") or DEFAULT_TZ,
        "actif": actif,
        "prompt": body,
        "erreur": None,
    }
    if not body:
        item["erreur"] = "corps vide : il n'y a rien à exécuter"
        return item
    try:
        item["cron"] = parse_cron(item["quand"])
    except ValueError as exc:
        item["erreur"] = "cron invalide (%s)" % exc
        return item
    try:
        ZoneInfo(item["tz"])
    except (ZoneInfoNotFoundError, ValueError):
        item["erreur"] = "fuseau inconnu : %r" % item["tz"]
        return item
    period = cron_period_minutes(item["cron"])
    if period < MIN_PERIOD:
        item["erreur"] = "trop fréquent (%d min < plancher %d min)" % (period, MIN_PERIOD)
    return item


def load_planifs() -> list[dict]:
    root = _planif_root()
    if not root.is_dir():
        return []
    out = []
    for p in sorted(root.glob("*.md")):
        item = _parse_fiche(p)
        if item:
            out.append(item)
    return out


# --- Journal (hors git) ----------------------------------------------------


def load_state() -> dict:
    try:
        state = json.loads(_state_path().read_text())
    except (OSError, ValueError):
        state = {}
    state.setdefault("runs", {})
    return state


def _save_state(state: dict) -> None:
    p = _state_path()
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(state, ensure_ascii=False, indent=1))
    except OSError:
        pass  # le journal est jetable : il ne fait jamais échouer un tour


def _record(pid: str, minute: str, entry: dict) -> None:
    state = load_state()
    run = state["runs"].setdefault(pid, {})
    run["last_minute"] = minute  # la minute HONORÉE : la dédup du tick s'appuie dessus
    run["last"] = entry
    hist = run.setdefault("journal", [])
    hist.insert(0, entry)
    del hist[JOURNAL_KEEP:]
    _save_state(state)


# --- La boucle -------------------------------------------------------------


def due_minute(item: dict, now: datetime, last_minute: str | None) -> str | None:
    """La minute à honorer maintenant, ou None. Format « YYYY-MM-DDTHH:MM » LOCAL.

    On balaie de la plus récente à la plus ancienne dans la fenêtre de grâce et on
    s'arrête à la première qui matche : au réveil après une interruption, on rejoue
    UNE occurrence (la dernière), jamais la file.

    La minute locale sert aussi de clé de dédup, d'où deux comportements assumés aux
    changements d'heure : au printemps, une tâche calée sur une heure qui n'existe pas
    ce jour-là ne part pas ; à l'automne, l'heure rejouée est vue comme déjà honorée,
    donc on ne déclenche pas deux fois. Sauter vaut mieux que doubler.
    """
    if not item.get("actif") or item.get("erreur"):
        return None
    tz = ZoneInfo(item["tz"])
    local = now.astimezone(tz)
    for back in range(0, GRACE + 1):
        cand = (local - timedelta(minutes=back)).replace(second=0, microsecond=0)
        stamp = cand.strftime("%Y-%m-%dT%H:%M")
        if last_minute is not None and stamp <= last_minute:
            return None  # déjà honorée (ou plus vieille) : rien à rejouer
        if cron_match(item["cron"], cand):
            return stamp
    return None


# Cadre de provenance, sur le patron d'`ask_alfred`. Sans lui, l'agent ne peut pas SAVOIR
# qu'il est dans un tour planifié : la discipline du CLAUDE.md lui dit comment s'y
# comporter (muet, idempotent, sans Google), encore faut-il qu'il sache y être. Le corps
# de la fiche reste en dessous, mot pour mot — le cadre dit d'où vient le message, il ne
# réécrit pas l'instruction.
FRAME = (
    "[Tour planifié « {titre} » — déclenché par l'horloge à {heure}, pas par Monsieur. "
    "PERSONNE ne lit cette réponse : fais le travail, écris dans memory/, commit, et "
    "n'écris de compte rendu à personne. S'il n'y a rien à faire, ne fais rien. La surface "
    "Google est fermée sur ce canal (cf. D30).]\n\n{corps}"
)


async def _fire(item: dict, minute: str, runner) -> None:
    """Un tour planifié. Jamais d'exception vers la boucle : elle doit survivre à tout."""
    started = datetime.now().astimezone()
    entry = {"at": started.isoformat(timespec="seconds"), "minute": minute}
    prompt = FRAME.format(
        titre=item["titre"], heure=minute.replace("T", " à "), corps=item["prompt"]
    )
    try:
        reply, _sid = await asyncio.wait_for(
            runner(prompt, env={"GW_CHANNEL": "planif"}), timeout=TIMEOUT
        )
        entry["ok"] = True
        entry["resume"] = (reply or "").strip()[:400]
    except asyncio.TimeoutError:
        entry["ok"] = False
        entry["erreur"] = "délai dépassé (%d s)" % TIMEOUT
    except Exception as exc:
        entry["ok"] = False
        entry["erreur"] = "%s: %s" % (type(exc).__name__, exc)
        traceback.print_exc()
    entry["ms"] = int((datetime.now().astimezone() - started).total_seconds() * 1000)
    _record(item["id"], minute, entry)


async def loop(runner) -> None:
    """Le tick. `runner(prompt, env=…)` est injecté (main._run_alfred) pour que ce
    module reste testable sans le SDK."""
    while True:
        try:
            now = datetime.now().astimezone()
            state = load_state()
            for item in load_planifs():
                last = state["runs"].get(item["id"], {}).get("last_minute")
                minute = due_minute(item, now, last)
                if minute:
                    # Séquentiel à dessein : _run_alfred sérialise déjà sur
                    # _query_lock, et deux tours planifiés qui se marchent dessus
                    # n'apporteraient qu'une file d'attente invisible.
                    await _fire(item, minute, runner)
        except Exception:
            traceback.print_exc()  # une fiche pourrie ne tue pas l'horloge
        await asyncio.sleep(TICK)


# --- API (lecture seule) ---------------------------------------------------


def _next_runs(item: dict, now_local: datetime, count: int = 1) -> list[str]:
    """Les prochaines échéances, par balayage minute à minute sur 366 jours max.
    Grossier, mais appelé au plus quelques fois par affichage — et sans arithmétique
    de fuseau à déboguer un dimanche de changement d'heure."""
    if item.get("erreur") or not item.get("cron"):
        return []
    out: list[str] = []
    cur = now_local.replace(second=0, microsecond=0)
    for _ in range(366 * 24 * 60):
        cur += timedelta(minutes=1)
        if cron_match(item["cron"], cur):
            out.append(cur.strftime("%Y-%m-%dT%H:%M"))
            if len(out) >= count:
                break
    return out


@router.get("")
async def planif_list():
    """Tout ce qu'il faut à l'onglet : les fiches, leur prochaine échéance et leur
    journal. Le cron n'est parsé QUE ici — le front n'en réimplémente pas un."""
    state = load_state()
    out = []
    for item in load_planifs():
        tz = ZoneInfo(item["tz"]) if not item.get("erreur") else None
        run = state["runs"].get(item["id"], {})
        nxt = _next_runs(item, datetime.now(tz), 1) if (tz and item["actif"]) else []
        out.append(
            {
                "id": item["id"],
                "path": item["path"],
                "titre": item["titre"],
                "quand": item["quand"],
                "tz": item["tz"],
                "actif": item["actif"],
                "erreur": item["erreur"],
                "prompt": item["prompt"],
                "next": nxt[0] if nxt else None,
                "last": run.get("last"),
                "journal": run.get("journal", []),
            }
        )
    return {"planifs": out, "tick": TICK, "grace": GRACE, "minPeriod": MIN_PERIOD}
