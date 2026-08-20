"""Les exécutables du corps — rangement et copies partagées.

Ce banc ne teste pas du comportement : il tient une INVARIANTE DE DÉPÔT que rien
d'autre ne tient. Deux images embarquent `mcp-bridge`, et leurs Dockerfiles
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
#
# `memory-sync` figurait ici jusqu'au 2026-08-20 : retiré avec l'outil, la mémoire
# ayant quitté git (elle vit sur le système de fichiers, filet ZFS).
OUTILS = {"agent-gw": ("mcp-bridge",),
          "claude-pod": ("mcp-bridge",)}
for image, outils in OUTILS.items():
    root = IMAGES / image
    egares = [n for n in outils if (root / n).exists()]
    check("%s : plus rien en vrac à la racine (%s)"
          % (image, ", ".join(egares) or "propre"), not egares)
    check("%s : tout est sous bin/" % image,
          all((root / "bin" / n).is_file() for n in outils))

check("agent-gw/bin/ porte l'exécutable du corps",
      (AGENT_GW / "bin/mcp-bridge").is_file())
check("memory-sync a bien disparu du corps (mémoire hors git depuis le 2026-08-20)",
      not (AGENT_GW / "bin/memory-sync").exists())

print("\n--- la copie partagée : mcp-bridge, octet pour octet ---")

COPIES = [IMAGES / "agent-gw/bin/mcp-bridge",
          IMAGES / "claude-pod/bin/mcp-bridge"]

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

print("\n--- aucun domaine privé en VALEUR PAR DÉFAUT ---")

# La faute que ce banc empêche de revenir, et elle est facile à commettre : une
# image PUBLIQUE qui devine un nom d'hôte publie le déploiement de son auteur, et
# rend l'image inutilisable par quiconque d'autre. Les endpoints se déclarent dans
# le manifeste du pod ; le code refuse franchement quand ils manquent.
#
# ⚠️ On ne cherche PAS le domaine partout : raconter d'où l'on vient dans un
# commentaire est utile (« le défaut était … »), c'est le rendre par défaut qui ne
# l'est pas. D'où la recherche restreinte aux formes qui FIXENT une valeur —
# `os.environ.get(…, "…")` et l'expansion shell `${VAR:-…}`.
import re  # noqa: E402

LIVRES = [IMAGES / "agent-gw/bin/mcp-bridge",
          IMAGES / "claude-pod/bin/mcp-bridge",
          IMAGES / "agent-gw/plugins/parcours/bin/trace-geom",
          IMAGES / "agent-gw/plugins/git/bin/git-credential-hub",
          IMAGES / "agent-gw/plugins/git/setup",
          IMAGES / "agent-voice/app/main.py",
          IMAGES / "agent-gw/app/main.py"]
DEFAUT = re.compile(r"(environ\.get\(|:-)[^)\n]*(sberard|berard)")

for f in LIVRES:
    if not f.is_file():
        check("%s : présent" % f.name, False)
        continue
    fautes = [l.strip() for l in f.read_text(encoding="utf-8").splitlines()
              if DEFAUT.search(l)]
    check("%s : aucun domaine privé en défaut" % f.name, not fautes)
    for l in fautes:
        print("        " + l[:100])

print()
if FAILS:
    print("%d échec(s) : %s" % (len(FAILS), ", ".join(FAILS)))
    sys.exit(1)
print("BIN OK")
