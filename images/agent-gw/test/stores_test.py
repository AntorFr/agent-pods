"""Tests des MAGASINS de mémoire (GW_MEMORY_STORES).

Le contrat tient en une phrase : **avec un seul magasin, rien ne change**. Le
composeur s'exécute quand même — c'est tout l'intérêt de le livrer en configuration
dégénérée — mais l'union d'un ensemble à un élément est l'identité, et ça se prouve
en comparant les réponses, pas en le supposant.

Sans réseau ni SDK. Lancer depuis images/agent-gw :
    python test/stores_test.py
"""

import asyncio
import importlib
import json
import os
import sys
import tempfile
from pathlib import Path

WS = tempfile.mkdtemp()
os.environ["GW_WORKSPACE"] = WS
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.main as main  # noqa: E402

FAILS = []


def check(name, cond):
    print(("  ok  " if cond else "  FAIL") + "  " + name)
    if not cond:
        FAILS.append(name)


def load(stores=None):
    """Recharge le module avec un GW_MEMORY_STORES donné (None = absent)."""
    os.environ.pop("GW_MEMORY_STORES", None)
    if stores is not None:
        os.environ["GW_MEMORY_STORES"] = stores
    return importlib.reload(main)


def write(root, rel, text="---\ntype: fiche\ntitre: T\n---\ncorps\n"):
    p = Path(root) / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    return p


# ── Un arbre « perso » qui ressemble à une vraie mémoire ────────────────────
PERSO = Path(WS) / "memory"
write(PERSO, "domaines/cuisine/lasagnes.md")
write(PERSO, "domaines/cuisine/INDEX.md")
write(PERSO, "todo/taches.md")
write(PERSO, ".git/config", "rien")  # caché : jamais listé

FAMILLE = Path(WS) / "famille"
write(FAMILLE, "domaines/cuisine/tarte.md")
write(FAMILLE, "domaines/voyages/corse.md")

print("\n--- rétrocompatibilité : sans la variable, rien ne bouge ---")

m = load(None)
check("un seul magasin, bâti sur GW_MEMORY_DIR", len(m.MEMORY_STORES) == 1)
check("son identifiant est `perso`", m.MEMORY_STORES[0]["id"] == "perso")
check("il est en écriture", m.MEMORY_STORES[0]["mode"] == "rw")
check("il pointe la racine historique", m.MEMORY_STORES[0]["path"] == PERSO.resolve())

tree_avant = asyncio.run(m.memory_tree())
idx_avant = asyncio.run(m.memory_index())
check("l'arbre ne parle PAS de magasins quand il n'y en a qu'un",
      "stores" not in tree_avant and all("store" not in e for e in tree_avant["entries"]))
check("les fichiers cachés restent exclus",
      not any(e["path"].startswith(".git") for e in tree_avant["entries"]))

print("\n--- LE contrôle de non-régression : mono-magasin explicite == défaut ---")

m = load("perso=memory:rw")
tree_apres = asyncio.run(m.memory_tree())
idx_apres = asyncio.run(m.memory_index())
# Comparaison OCTET À OCTET des réponses sérialisées : c'est un diff, pas une
# impression. Si le composeur changeait quoi que ce soit — ordre, champs, chemins —
# ça se verrait ici et nulle part ailleurs.
check("/api/memory/tree rend exactement la même chose",
      json.dumps(tree_apres, sort_keys=True) == json.dumps(tree_avant, sort_keys=True))
check("/api/memory/index rend exactement la même chose",
      json.dumps(idx_apres, sort_keys=True) == json.dumps(idx_avant, sort_keys=True))

print("\n--- la déclaration se lit dans tous ses états ---")

m = load("perso=memory:rw,famille=" + str(FAMILLE) + ":ro")
check("deux magasins", len(m.MEMORY_STORES) == 2)
check("le second est en lecture seule", m.MEMORY_STORES[1]["mode"] == "ro")
check("chemin absolu respecté", m.MEMORY_STORES[1]["path"] == FAMILLE.resolve())

m = load("memory")
check("chemin nu → magasin `perso` en rw (forme courte tolérée)",
      len(m.MEMORY_STORES) == 1 and m.MEMORY_STORES[0]["id"] == "perso"
      and m.MEMORY_STORES[0]["mode"] == "rw")

m = load("perso=memory")
check("sans mode → rw par défaut", m.MEMORY_STORES[0]["mode"] == "rw")

m = load("  perso=memory:rw , , famille=" + str(FAMILLE) + ":ro  ")
check("espaces rognés, entrées vides ignorées", len(m.MEMORY_STORES) == 2)

print("\n--- l'UNION : un domaine est une vue, pas un conteneur ---")

m = load("perso=memory:rw,famille=" + str(FAMILLE) + ":ro")
tree = asyncio.run(m.memory_tree())
paths = {e["path"] for e in tree["entries"]}
check("les fiches des DEUX magasins sont là",
      "domaines/cuisine/lasagnes.md" in paths and "domaines/cuisine/tarte.md" in paths)
check("le domaine `cuisine` est composé, pas dupliqué",
      len([p for p in paths if p == "domaines/cuisine"]) == 1)
check("un domaine qui n'existe que dans le partagé apparaît",
      "domaines/voyages/corse.md" in paths)
check("le chemin logique ne porte JAMAIS le magasin",
      not any(p.startswith(("perso/", "famille/")) for p in paths))
check("l'origine est exposée quand il y a plusieurs magasins",
      all("store" in e for e in tree["entries"]) and "stores" in tree)

raw = m._resolve_logical("domaines/voyages/corse.md")
check("une fiche du partagé se lit par son chemin logique",
      raw is not None and raw.is_file())
check("un chemin inexistant rend None", m._resolve_logical("nulle/part.md") is None)
check("la traversée reste bloquée dans TOUS les magasins",
      m._resolve_logical("../../etc/passwd") is None)

print("\n--- la collision : signalée, jamais résolue en silence ---")

write(FAMILLE, "domaines/cuisine/lasagnes.md", "---\ntype: fiche\ntitre: Autre\n---\n")
m = load("perso=memory:rw,famille=" + str(FAMILLE) + ":ro")
tree = asyncio.run(m.memory_tree())
check("le doublon est REMONTÉ", "domaines/cuisine/lasagnes.md" in tree.get("collisions", []))
check("le plus prioritaire gagne (perso avant famille)",
      next(e for e in tree["entries"]
           if e["path"] == "domaines/cuisine/lasagnes.md")["store"] == "perso")
idx = asyncio.run(m.memory_index())
check("l'index n'expose le chemin qu'une fois",
      len([i for i in idx["items"] if i["path"] == "domaines/cuisine/lasagnes.md"]) == 1)
check("et c'est la version prioritaire",
      next(i for i in idx["items"]
           if i["path"] == "domaines/cuisine/lasagnes.md")["fm"]["titre"] == "T")

print("\n--- les écritures restent au magasin PRINCIPAL ---")

check("la racine d'écriture est le premier magasin", m._memory_root() == PERSO.resolve())
check("_memory_path borne au principal, jamais au partagé",
      str(m._memory_path("x.md")).startswith(str(PERSO.resolve())))

# Une planification est EXÉCUTÉE (son corps est le prompt d'un tour). La composer
# sur l'union laisserait un pair déposer du code qui tournerait ici.
import app.planif as planif  # noqa: E402
importlib.reload(planif)
check("les planifications ne se lisent QUE dans le magasin principal",
      str(planif._planif_root()).startswith(str(PERSO.resolve())))

print("\nFAIL" if FAILS else "\nSPIKE OK")
sys.exit(1 if FAILS else 0)
