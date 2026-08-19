"""Les exécutables du corps — rangement et copies partagées.

Ce banc ne teste pas du comportement : il tient une INVARIANTE DE DÉPÔT que rien
d'autre ne tient. Deux images embarquent `rosetta-bridge`, et leurs Dockerfiles
affirmaient depuis toujours, en commentaire, qu'elles portaient « la même copie ».
Un commentaire ne garantit rien : le jour où l'une est corrigée et pas l'autre, les
deux corps lancent des relais MCP différents — donc des outils différents — et rien
ne le dit. La panne se manifeste chez un seul agent, sur un seul outil, longtemps
après.

Sans réseau. Lancer depuis images/agent-gw :
    python test/bin_test.py
"""

import sys
from pathlib import Path

AGENT_GW = Path(__file__).resolve().parents[1]
IMAGES = AGENT_GW.parent

FAILS = []


def check(name, cond):
    print(("  ok  " if cond else "  FAIL") + "  " + name)
    if not cond:
        FAILS.append(name)


print("\n--- rangement : bin/ à la racine d'une image ---")

# La règle, et elle se lit d'un coup d'œil : `bin/` = ce que TOUT corps possède,
# `plugins/<id>/bin/` = ce qu'un plugin apporte. Un exécutable laissé à la racine
# ne dit plus lequel des deux il est.
#
# ⚠️ On NOMME les outils plutôt que de deviner « tout fichier exécutable à la
# racine » : la version heuristique attrapait `.dockerignore`, et `entrypoint.sh`
# de claude-pod est légitimement à la racine (c'est l'entrypoint du conteneur,
# pas un outil du PATH). Une règle qui crie au loup finit désactivée.
OUTILS = {"agent-gw": ("rosetta-bridge", "memory-sync"),
          "claude-pod": ("rosetta-bridge",)}
for image, outils in OUTILS.items():
    root = IMAGES / image
    egares = [n for n in outils if (root / n).exists()]
    check("%s : plus rien en vrac à la racine (%s)"
          % (image, ", ".join(egares) or "propre"), not egares)
    check("%s : tout est sous bin/" % image,
          all((root / "bin" / n).is_file() for n in outils))

check("agent-gw/bin/ porte les deux exécutables du corps",
      (AGENT_GW / "bin/rosetta-bridge").is_file()
      and (AGENT_GW / "bin/memory-sync").is_file())

print("\n--- la copie partagée : rosetta-bridge, octet pour octet ---")

COPIES = [IMAGES / "agent-gw/bin/rosetta-bridge",
          IMAGES / "claude-pod/bin/rosetta-bridge"]

check("les deux images l'embarquent", all(p.is_file() for p in COPIES))

if all(p.is_file() for p in COPIES):
    blobs = [p.read_bytes() for p in COPIES]
    check("contenus identiques — sinon les deux corps lancent des outils différents",
          blobs[0] == blobs[1])
    # Le bit d'exécution compte autant que le contenu : les Dockerfiles posent
    # --chmod=755, mais un fichier non exécutable dans le dépôt se lance mal en
    # local (sur le Mac, hors conteneur) et c'est là qu'on le teste d'abord.
    import os
    check("exécutables dans le dépôt, pas seulement dans l'image",
          all(os.access(p, os.X_OK) for p in COPIES))

print()
if FAILS:
    print("%d échec(s) : %s" % (len(FAILS), ", ".join(FAILS)))
    sys.exit(1)
print("BIN OK")
