"""Tests du module planif (cron, fenêtre de grâce, chargement des fiches, API).

Sans réseau ni SDK : on injecte un faux `runner`. Lancer depuis images/agent-gw :
    python -m pytest test/planif_test.py -q      (ou: python test/planif_test.py)
"""

import asyncio
import os
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

WS = tempfile.mkdtemp()
os.environ["GW_WORKSPACE"] = WS
os.environ["GW_MEMORY_DIR"] = "memory"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import planif  # noqa: E402

PARIS = ZoneInfo("Europe/Paris")
ROOT = Path(WS) / "memory" / "planif"
ROOT.mkdir(parents=True)

FAILS = []


def check(name, cond):
    print(("  ok  " if cond else "  FAIL") + "  " + name)
    if not cond:
        FAILS.append(name)


def fiche(slug, quand, body="Fais le ménage.", actif="true", tz="Europe/Paris"):
    (ROOT / (slug + ".md")).write_text(
        "---\ntype: planif\ntitre: %s\nquand: \"%s\"\ntz: %s\nactif: %s\n---\n\n%s\n"
        % (slug.replace("-", " ").capitalize(), quand, tz, actif, body),
        encoding="utf-8",
    )


def raises(fn):
    try:
        fn()
        return False
    except ValueError:
        return True


print("— cron : parsing")
check("refus < 5 champs", raises(lambda: planif.parse_cron("0 7 * *")))
check("refus terme inconnu", raises(lambda: planif.parse_cron("0 7 * * mon")))
check("refus hors bornes", raises(lambda: planif.parse_cron("0 25 * * *")))
check("refus pas nul", raises(lambda: planif.parse_cron("*/0 * * * *")))
c = planif.parse_cron("0 7,19 * * *")
check("liste d'heures", c[1] == {7, 19} and c[0] == {0})
c = planif.parse_cron("*/15 * * * *")
check("pas */15", c[0] == {0, 15, 30, 45})
c = planif.parse_cron("30 8-10 * * *")
check("intervalle d'heures", c[1] == {8, 9, 10})
check("dimanche 7 == 0", 0 in planif.parse_cron("0 3 * * 7")[4])

print("— cron : matching")
at = lambda s: datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=PARIS)
c = planif.parse_cron("0 7 * * *")
check("match l'heure pile", planif.cron_match(c, at("2026-07-29 07:00")))
check("pas la minute d'après", not planif.cron_match(c, at("2026-07-29 07:01")))
# dom ET dow restreints = OU (sémantique cron historique)
c2 = planif.parse_cron("0 3 1 * 1")
check("dom|dow = OU (le 1er)", planif.cron_match(c2, at("2026-06-01 03:00")))  # lundi ET 1er
check("dom|dow = OU (un lundi)", planif.cron_match(c2, at("2026-07-27 03:00")))  # lundi 27
check("dom|dow = OU (le 1er un mer.)", planif.cron_match(c2, at("2026-07-01 03:00")))
check("dom|dow : ni l'un ni l'autre", not planif.cron_match(c2, at("2026-07-28 03:00")))

print("— plancher de fréquence")
check("*/5 sous le plancher", planif.cron_period_minutes(planif.parse_cron("*/5 * * * *")) == 5)
check("*/15 au plancher", planif.cron_period_minutes(planif.parse_cron("*/15 * * * *")) == 15)
check("quotidien = 1 jour", planif.cron_period_minutes(planif.parse_cron("0 7 * * *")) == 1440)
check("2 fois par jour = 60+", planif.cron_period_minutes(planif.parse_cron("0 7,19 * * *")) == 60)

print("— fiches")
fiche("menage", "0 7 * * *")
fiche("suspendue", "0 8 * * *", actif="false")
fiche("trop-frequente", "*/5 * * * *")
fiche("cron-casse", "tous les jours")
fiche("vide", "0 9 * * *", body="")
fiche("tz-inconnu", "0 9 * * *", tz="Mars/Olympus")
(ROOT / "pas-une-planif.md").write_text("---\ntype: tache\n---\n\nbonjour\n", encoding="utf-8")
P = {p["id"]: p for p in planif.load_planifs()}
check("6 fiches planif, la tache ignorée", len(P) == 6 and "pas-une-planif" not in P)
check("corps = instruction", P["menage"]["prompt"] == "Fais le ménage.")
check("actif: false lu", P["suspendue"]["actif"] is False)
check("trop fréquente marquée", "plancher" in (P["trop-frequente"]["erreur"] or ""))
check("cron cassé marqué", "cron invalide" in (P["cron-casse"]["erreur"] or ""))
check("corps vide marqué", "corps vide" in (P["vide"]["erreur"] or ""))
check("fuseau inconnu marqué", "fuseau" in (P["tz-inconnu"]["erreur"] or ""))

print("— fenêtre de grâce / dédup")
now = at("2026-07-29 07:00")
check("déclenche à l'heure", planif.due_minute(P["menage"], now, None) == "2026-07-29T07:00")
check("pas deux fois la même minute",
      planif.due_minute(P["menage"], now, "2026-07-29T07:00") is None)
check("rattrape dans la grâce",
      planif.due_minute(P["menage"], at("2026-07-29 07:03"), None) == "2026-07-29T07:00")
check("ne rattrape pas au-delà",
      planif.due_minute(P["menage"], at("2026-07-29 07:30"), None) is None)
check("suspendue ne part jamais", planif.due_minute(P["suspendue"], at("2026-07-29 08:00"), None) is None)
check("invalide ne part jamais", planif.due_minute(P["cron-casse"], now, None) is None)
# Pas de file d'attente : après 40 min d'interruption, UNE occurrence, pas huit.
q = P["menage"].copy(); q["cron"] = planif.parse_cron("*/15 * * * *"); q["erreur"] = None
check("une seule occurrence après coupure",
      planif.due_minute(q, at("2026-07-29 08:02"), "2026-07-29T07:15") == "2026-07-29T08:00")

print("— la boucle : elle exécute, journalise, et survit")
seen = []


async def runner(prompt, env=None):
    seen.append((prompt, env))
    return ("compte rendu", "sess-1")


async def one_pass():
    # Un seul tour de boucle : on la lance, on laisse un tick, on annule.
    planif.TICK = 0.05
    t = asyncio.create_task(planif.loop(runner))
    await asyncio.sleep(0.25)
    t.cancel()


# On force l'échéance : la fiche « chaque minute » serait refusée par le plancher, donc
# on cale le cron sur la minute courante réelle.
n = datetime.now(PARIS)
fiche("maintenant", "%d %d * * *" % (n.minute, n.hour))
asyncio.run(one_pass())
check("le tour a bien tourné", len(seen) == 1)
check("corps de la fiche transmis mot pour mot", seen and seen[0][0].endswith("Fais le ménage."))
check("cadre de provenance en tête", seen and seen[0][0].startswith("[Tour planifié «"))
check("le cadre dit que personne ne lit", seen and "PERSONNE ne lit" in seen[0][0])
check("canal planif injecté", seen and seen[0][1] == {"GW_CHANNEL": "planif"})
st = planif.load_state()
check("journal écrit", st["runs"]["maintenant"]["last"]["ok"] is True)
check("résumé tronqué gardé", st["runs"]["maintenant"]["last"]["resume"] == "compte rendu")
check("journal hors git (dans planif/)", (ROOT / "planif-state.json").is_file())
seen.clear()
asyncio.run(one_pass())
check("pas rejouée au tick suivant", len(seen) == 0)


print("— la boucle encaisse un tour qui explose")


async def boom(prompt, env=None):
    raise RuntimeError("le SDK a éternué")


(ROOT / "maintenant.md").unlink()
n = datetime.now(PARIS)
fiche("qui-plante", "%d %d * * *" % (n.minute, n.hour))


async def one_pass_boom():
    planif.TICK = 0.05
    t = asyncio.create_task(planif.loop(boom))
    await asyncio.sleep(0.25)
    t.cancel()


asyncio.run(one_pass_boom())
last = planif.load_state()["runs"]["qui-plante"]["last"]
check("échec journalisé, pas propagé", last["ok"] is False and "éternué" in last["erreur"])

print("— API")
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

api = FastAPI()
api.include_router(planif.router)
r = TestClient(api).get("/api/planif")
check("200", r.status_code == 200)
body = r.json()
byid = {p["id"]: p for p in body["planifs"]}
check("expose le prompt et le chemin", byid["menage"]["prompt"] == "Fais le ménage."
      and byid["menage"]["path"] == "planif/menage.md")
check("prochaine échéance calculée", byid["menage"]["next"].endswith("T07:00"))
check("pas d'échéance pour une suspendue", byid["suspendue"]["next"] is None)
check("erreur remontée telle quelle", byid["cron-casse"]["erreur"])

print()
if FAILS:
    print("ÉCHECS : " + ", ".join(FAILS))
    sys.exit(1)
print("Tout est vert. Évidemment.")
