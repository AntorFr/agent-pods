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
    asyncio.run(m.version()) == {"version": m.GW_VERSION, "apps": ["repos"]},
)

print("\nFAIL" if FAILS else "\nSPIKE OK")
sys.exit(1 if FAILS else 0)
