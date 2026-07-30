"""Tests de la configuration des app-modules (GW_APPS).

`APPS` est calculée à l'import : chaque cas recharge `app.main` avec un
environnement différent. Sans réseau ni SDK. Lancer depuis images/agent-gw :
    python test/apps_test.py
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


def load(value):
    """Recharge le module avec un GW_APPS donné (None = variable absente)."""
    os.environ.pop("GW_APPS", None)
    if value is not None:
        os.environ["GW_APPS"] = value
    return importlib.reload(main)


print("\n--- GW_APPS ---")

m = load(None)
check(
    "absent -> jeu historique (une montée de version ne change rien)",
    m.APPS == ["todo", "projets", "atelier", "planif", "voyages"],
)

m = load("todo,planif")
check("liste explicite -> restreinte", m.APPS == ["todo", "planif"])

m = load(" repos , todo ,, ")
check("espaces rognés, entrées vides ignorées", m.APPS == ["repos", "todo"])

m = load("")
check("chaîne vide -> aucun module (accueil sans tuile transverse)", m.APPS == [])

m = load("repos")
check(
    "/api/version publie les modules (le lanceur s'en sert au boot)",
    asyncio.run(m.version()) == {"version": m.GW_VERSION, "apps": ["repos"], "theme": "alfred"},
)

print("\n--- GW_THEME ---")

os.environ.pop("GW_THEME", None)
m = importlib.reload(main)
check("absent -> alfred (le pod existant ne bouge pas)", m.THEME == "alfred")

os.environ["GW_THEME"] = "skippy"
m = importlib.reload(main)
check("valeur explicite -> publiée sur /api/version",
      asyncio.run(m.version())["theme"] == "skippy")

os.environ["GW_THEME"] = "   "
m = importlib.reload(main)
check("valeur blanche -> repli sur alfred (jamais d'attribut vide)", m.THEME == "alfred")
os.environ.pop("GW_THEME", None)

print("\n--- GW_TRACE ---")

os.environ.pop("GW_TRACE", None)
m = importlib.reload(main)
check("absent -> trace coupée (le majordome reste discret)", m.TRACE is False)

for val in ("1", "true", "ON", "yes"):
    os.environ["GW_TRACE"] = val
    check("« %s » active la trace" % val, importlib.reload(main).TRACE is True)
os.environ["GW_TRACE"] = "0"
check("« 0 » la coupe", importlib.reload(main).TRACE is False)
os.environ.pop("GW_TRACE", None)
m = importlib.reload(main)

tt = m._trace_target
check("cible = le champ le plus parlant", tt({"file_path": "app/main.py", "limit": 20}) == "app/main.py")
check("commande repliée sur une ligne", tt({"command": "git status\n  --short"}) == "git status --short")
check("cible tronquée à 78 caractères", len(tt({"command": "x" * 300})) == 78)
check("dict sans champ connu -> vide (on ne dump JAMAIS l'input)", tt({"content": "secret"}) == "")
check("entrée non-dict -> vide", tt("nope") == "")

print("\nFAIL" if FAILS else "\nSPIKE OK")
sys.exit(1 if FAILS else 0)
