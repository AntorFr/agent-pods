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
# ayant quitté git. `instruction-sync` l'a remplacé le même jour sur le seul terrain
# qui restait — les INSTRUCTIONS, elles co-éditées (pod + machine de dev).
OUTILS = {"agent-gw": ("mcp-bridge", "instruction-sync"),
          "claude-pod": ("mcp-bridge",)}
for image, outils in OUTILS.items():
    root = IMAGES / image
    egares = [n for n in outils if (root / n).exists()]
    check("%s : plus rien en vrac à la racine (%s)"
          % (image, ", ".join(egares) or "propre"), not egares)
    check("%s : tout est sous bin/" % image,
          all((root / "bin" / n).is_file() for n in outils))

check("agent-gw/bin/ porte les deux exécutables du corps",
      (AGENT_GW / "bin/mcp-bridge").is_file()
      and (AGENT_GW / "bin/instruction-sync").is_file())
check("memory-sync a bien disparu du corps (mémoire hors git depuis le 2026-08-20)",
      not (AGENT_GW / "bin/memory-sync").exists())

# La garde d'instruction-sync est la seule chose qui se dresse entre un `pull` et
# l'effacement de la mémoire vivante du NAS. Un banc qui vérifie sa PRÉSENCE dans le
# source coûte trois lignes ; la retirer par inadvertance coûterait la mémoire.
_ISYNC = (AGENT_GW / "bin/instruction-sync")
if _ISYNC.is_file():
    _src = _ISYNC.read_text(encoding="utf-8")
    check("instruction-sync refuse de tourner si memory/ est suivi par git",
          "refuse_si_memoire_suivie" in _src and "git ls-files memory" in _src)
    check("instruction-sync scope son helper sur github.com, jamais global",
          "credential.https://github.com.helper" in _src
          and "credential.helper '" not in _src)
    # On vérifie la forme POSITIVE plutôt que l'absence d'une chaîne : « add -A »
    # apparaît légitimement dans le message qui explique pourquoi on ne le fait pas,
    # et un banc qui échoue sur sa propre documentation finit désactivé.
    check("instruction-sync stage par chemin explicite, jamais tout l'arbre",
          'add -- "$@"' in _src)

print("\n--- l'entrypoint pose l'umask, et le CMD n'est recopié nulle part ---")

# Cette garde existe parce que la panne qu'elle empêche est INVISIBLE. Sans
# `umask 002`, les fichiers naissent en 0644 dans le cercle de mémoire PARTAGÉ : les
# deux corps qui l'écrivent (sous des UID différents, réunis par un seul groupe
# secondaire) peuvent chacun CRÉER, mais aucun ne peut MODIFIER le fichier de
# l'autre. Rien n'échoue au montage ni au démarrage — ça ne se voit qu'au premier
# `Edit` refusé, longtemps après. Et ça ne peut pas se rattraper côté serveur : en
# NFS l'umask est applique côté client (mesuré le 2026-08-20).
_ENTRY = AGENT_GW / "entrypoint.sh"
_DOCKER = (AGENT_GW / "Dockerfile").read_text(encoding="utf-8")

check("agent-gw a un entrypoint à la RACINE (pas dans bin/, qui est le PATH)",
      _ENTRY.is_file() and not (AGENT_GW / "bin/entrypoint.sh").exists())
if _ENTRY.is_file():
    _e = _ENTRY.read_text(encoding="utf-8")
    check("il pose umask 002 — le bit sans lequel la co-édition du cercle partagé casse",
          "umask 002" in _e)
    check("il passe la main par exec \"$@\" au lieu de recopier la commande",
          'exec "$@"' in _e)
check("le Dockerfile le branche sur tini", '"/entrypoint.sh"' in _DOCKER)
# Le CMD doit rester déclaratif DANS l'image : c'est ce qui permet aux manifestes de
# ne plus le dupliquer. Cet umask a vécu en `args` côté k8s jusqu'au 2026-08-20, ce
# qui y recopiait la commande de démarrage — et l'aurait épinglée le jour où elle
# changerait, sans un mot.
check("le CMD uvicorn reste déclaré dans l'image",
      'CMD ["uvicorn"' in _DOCKER)

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
