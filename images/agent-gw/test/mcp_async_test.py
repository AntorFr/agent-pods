"""Tests de la surface MCP asynchrone (`ask_<agent>` + `ask_<agent>_status`).

Le tour lui-même est remplacé par un faux `_run_alfred` : on teste la mécanique
d'accusé de réception, la file bornée, la remontée d'erreur et le garde-fou
anti-boucle du rappel croisé. Sans réseau ni SDK. Lancer depuis images/agent-gw :
    .venv/bin/python test/mcp_async_test.py
"""

import asyncio
import importlib
import os
import sys
import tempfile
from pathlib import Path

os.environ["GW_WORKSPACE"] = tempfile.mkdtemp()
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.main as main  # noqa: E402

FAILS = []


def check(name, cond):
    print(("  ok  " if cond else "  FAIL") + "  " + name)
    if not cond:
        FAILS.append(name)


def load(**env):
    """Recharge le module avec un environnement donné (None = variable absente)."""
    for var in ("GW_MCP_MAX_PENDING", "GW_PEER_MCP_URL", "GW_PEER_MCP_TOKEN", "GW_PEER_MCP_TOOL"):
        os.environ.pop(var, None)
    for k, v in env.items():
        if v is not None:
            os.environ[k] = v
    return importlib.reload(main)


def fake_turn(delay=0.0, reply="fait", session="sess-1", boom=None):
    """Remplace _run_alfred. `delay` laisse le temps d'observer l'état 'running'."""

    async def _run(prompt, resume=None, env=None):
        if delay:
            await asyncio.sleep(delay)
        if boom:
            raise RuntimeError(boom)
        return reply, session

    return _run


print("\n--- l'appel rend la main tout de suite ---")

m = load()
m._run_alfred = fake_turn(delay=0.25)


async def scenario_accepte():
    ack = await m.ask_agent("range ceci", agent="skippy")
    # Rendu AVANT que le tour soit fini : c'est tout l'objet du patch.
    en_vol = await m.ask_agent_status(ack["job_id"])
    await asyncio.sleep(0.4)
    fini = await m.ask_agent_status(ack["job_id"])
    return ack, en_vol, fini


ack, en_vol, fini = asyncio.run(scenario_accepte())
check("rend un job_id", bool(ack.get("job_id")))
check("statut 'accepted', pas la réponse", ack.get("status") == "accepted" and "reply" not in ack)
check("annonce l'outil de reprise", ack.get("poll_with") == "ask_alfred_status")
check("en vol -> pending/running", en_vol["status"] in ("pending", "running"))
check("en vol -> dit depuis combien de temps", "waiting_since_s" in en_vol)
check("terminé -> done", fini["status"] == "done")
check("terminé -> porte la réponse", fini.get("reply") == "fait")
check("terminé -> rend le task_id de reprise", fini.get("task_id") == "sess-1")

print("\n--- ce qui ne doit pas passer ---")

m = load()
m._run_alfred = fake_turn()
check("requête vide -> refus", "error" in asyncio.run(m.ask_agent("   ")))
check("job_id inconnu -> refus", "error" in asyncio.run(m.ask_agent_status("nexiste-pas")))

print("\n--- la file est bornée (sinon on empile des tours fantômes) ---")

m = load(GW_MCP_MAX_PENDING="2")
m._run_alfred = fake_turn(delay=0.3)


async def scenario_file():
    a = await m.ask_agent("un")
    b = await m.ask_agent("deux")
    trop = await m.ask_agent("trois")
    return a, b, trop


a, b, trop = asyncio.run(scenario_file())
check("plancher respecté : 2 acceptés", a.get("status") == "accepted" and b.get("status") == "accepted")
check("le 3e est refusé, pas mis en attente", trop.get("error") == "file pleine")
check("le refus dit pourquoi (max_pending)", trop.get("max_pending") == 2)
check("un refus ne crée pas de travail", len(m._jobs) == 2)
check("valeur absurde -> plancher à 1", load(GW_MCP_MAX_PENDING="0").MCP_MAX_PENDING == 1)

print("\n--- une erreur de tour remonte, elle n'est pas avalée ---")

m = load()
m._run_alfred = fake_turn(boom="le disque est plein")


async def scenario_erreur():
    ack = await m.ask_agent("casse-toi")
    await asyncio.sleep(0.05)
    return await m.ask_agent_status(ack["job_id"])


st = asyncio.run(scenario_erreur())
check("statut error", st["status"] == "error")
check("message d'erreur transmis", "disque est plein" in st.get("error", ""))

print("\n--- rappel croisé : garde-fou anti-boucle ---")

m = load(GW_PEER_MCP_URL="https://peer/mcp/", GW_PEER_MCP_TOKEN="t", GW_PEER_MCP_TOOL="ask_peer")
body = m._peer_call_body({"id": "abc", "request": "r", "reply": "ok"})
args = body["params"]["arguments"]
check("enveloppe JSON-RPC tools/call", body["method"] == "tools/call")
check("vise l'outil du pair", body["params"]["name"] == "ask_peer")
check("ANTI-BOUCLE : le rappel pose notify=False", args["notify"] is False)
check("le compte rendu dit de ne pas répondre", "Rien à répondre" in args["request"])
check("le compte rendu porte le résultat", "ok" in args["request"])

print("\n--- le rappel ne part que si on l'a demandé ET câblé ---")

appels = []


async def faux_notify(job):
    appels.append(job["id"])


m = load()
m._run_alfred = fake_turn()
m._notify_peer = faux_notify


async def scenario_notify():
    a = await m.ask_agent("avec", notify=True)
    b = await m.ask_agent("sans", notify=False)
    await asyncio.sleep(0.1)
    return a, b


a, b = asyncio.run(scenario_notify())
check("notify=True -> rappel émis", a["job_id"] in appels)
check("notify=False -> aucun rappel", b["job_id"] not in appels)

m = load()  # pair non configuré
check("pair non câblé -> _notify_peer est inerte",
      asyncio.run(m._notify_peer({"id": "x", "request": "r", "reply": "ok"})) is None)

print("\n--- purge : un compte rendu ne vit pas éternellement ---")

m = load()
m._jobs["vieux"] = {"id": "vieux", "status": "done", "ended": 0.0}
m._jobs["frais"] = {"id": "frais", "status": "done", "ended": 9e12}
m._jobs["encours"] = {"id": "encours", "status": "running", "ended": 0.0}
m._job_gc()
check("purge le terminé trop vieux", "vieux" not in m._jobs)
check("garde le terminé récent", "frais" in m._jobs)
check("ne purge JAMAIS un travail en cours", "encours" in m._jobs)

print("\n" + ("FAIL: " + ", ".join(FAILS) if FAILS else "TOUT VERT"))
sys.exit(1 if FAILS else 0)
