"""La RACINE des planifications — découplée de la mémoire (2026-08-20).

Ce banc tient un invariant que rien d'autre ne tient, et dont la violation serait
SILENCIEUSE : `GW_PLANIF_DIR` est relatif au WORKSPACE, plus à la mémoire.

Pourquoi ça compte. Le corps d'une fiche `type: planif` est exécuté tel quel comme
prompt (D30) : c'est de l'instruction, donc du versionné. La mémoire, elle, a quitté
git le 2026-08-20 et vit sur un point de montage NFS. Si la racine des planifs
retombait sous `memory/`, deux choses casseraient sans un mot :
  - les planifs sortiraient de git avec la mémoire (plus de diff, plus de revert
    sur du prompt exécutable) ;
  - et suivre en git quoi que ce soit sous `memory/` rouvrirait le risque qu'un
    `pull` écrive dans le montage NFS.

Le défaut doit rester RÉTRO-COMPATIBLE : un déploiement qui ne déclare rien doit
lire exactement `<workspace>/memory/planif`, comme avant.

Sans réseau. Lancer depuis images/agent-gw :
    python test/planif_root_test.py
"""

import importlib
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

FAILS = []


def check(name, cond):
    print(("  ok  " if cond else "  FAIL") + "  " + name)
    if not cond:
        FAILS.append(name)


def charge(planif_dir=None, memory_dir=None, workspace="/ws"):
    """Recharge le module avec un environnement donné."""
    os.environ["GW_WORKSPACE"] = workspace
    for var, val in (("GW_PLANIF_DIR", planif_dir), ("GW_MEMORY_DIR", memory_dir)):
        os.environ.pop(var, None)
        if val is not None:
            os.environ[var] = val
    import app.planif as m
    return importlib.reload(m)


print("\n--- le défaut ne bouge pas d'un octet (rétro-compatibilité) ---")

m = charge()
check("sans rien déclarer, la racine est <workspace>/memory/planif",
      m._planif_root() == Path("/ws/memory/planif"))
check("l'état vit à côté des fiches",
      m._state_path() == Path("/ws/memory/planif/planif-state.json"))

# Le cas historique : la fiche est DANS la mémoire, donc le navigateur sait l'ouvrir
# et la PWA doit continuer à en faire un lien `#/mem/…`.
info = m._ou_est_la_fiche(Path("/ws/memory/planif/briefing.md"))
check("une fiche du défaut est annoncée comme atteignable par le navigateur",
      info["dans_memoire"] is True)
check("son chemin reste relatif à la mémoire, comme avant",
      info["path"] == "planif/briefing.md")

print("\n--- déclaré hors de la mémoire : le régime cible ---")

m = charge(planif_dir="planif")
check("GW_PLANIF_DIR est relatif au WORKSPACE, pas à la mémoire",
      m._planif_root() == Path("/ws/planif"))
check("la racine n'est PAS sous memory/ — le garde-fou reste sans exception",
      "memory" not in m._planif_root().parts)

info = m._ou_est_la_fiche(Path("/ws/planif/briefing.md"))
check("une fiche hors mémoire est annoncée NON atteignable par le navigateur",
      info["dans_memoire"] is False)
check("son chemin devient relatif à la racine des planifs",
      info["path"] == "briefing.md")

print("\n--- indépendance réelle vis-à-vis du magasin mémoire ---")

# Le cas Nestor : sa mémoire est un cercle partagé, hors du workspace. Avant le
# découplage, il ne POUVAIT structurellement pas avoir d'horloge.
m = charge(planif_dir="planif", memory_dir="/shared/famille")
check("un magasin mémoire ailleurs ne déplace plus la racine des planifs",
      m._planif_root() == Path("/ws/planif"))
check("une planif ne vit dans AUCUN magasin — rien à composer, donc rien à injecter",
      m._planif_root() != Path("/shared/famille/planif"))

# ⚠️ Pas `/etc/planif` ici : sur macOS `/etc` est un lien vers `/private/etc`, que
# `.resolve()` déplie — le banc échouerait sur un artefact de la machine de dev, pas
# sur un défaut du code. On prend un chemin qui n'existe nulle part.
m = charge(planif_dir="/opt/planif-hors-workspace")
check("un chemin absolu est respecté tel quel",
      m._planif_root() == Path("/opt/planif-hors-workspace"))

print()
if FAILS:
    print("%d échec(s) : %s" % (len(FAILS), ", ".join(FAILS)))
    sys.exit(1)
print("PLANIF ROOT OK")
