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
    asyncio.run(m.version()) == {
        "version": m.GW_VERSION, "apps": ["repos"],
        "features": ["scan", "attach", "eph", "tunnel", "sujets"], "theme": "alfred",
    },
)

print("\n--- GW_FEATURES : les capacités de la coque ---")


def load_features(value):
    """Recharge le module avec un GW_FEATURES donné (None = variable absente)."""
    os.environ.pop("GW_FEATURES", None)
    if value is not None:
        os.environ["GW_FEATURES"] = value
    return importlib.reload(main)


m = load_features(None)
check(
    "absent -> jeu historique (une montée de version ne change rien)",
    m.FEATURES == ["scan", "attach", "eph", "tunnel", "sujets"],
)

m = load_features("attach,eph,tunnel,sujets")
check("le cas d'usage : un agent de code sans lecteur de code-barres",
      "scan" not in m.FEATURES and "attach" in m.FEATURES)

m = load_features(" scan , attach ,, ")
check("espaces rognés, entrées vides ignorées", m.FEATURES == ["scan", "attach"])

m = load_features("")
check("chaîne vide -> aucune capacité (composeur nu ; le bouclier, lui, reste)",
      m.FEATURES == [])

# Le bouclier n'est pas un composant : il ne doit apparaître dans AUCUNE liste, ni
# par défaut ni par accident. Une garde qu'on éteint par variable d'environnement
# est un piège — cf. le commentaire de FEATURES dans app/main.py.
m = load_features(None)
check("le bouclier n'est pas une capacité désactivable", "shield" not in m.FEATURES)

m = load_features("scan")
check(
    "/api/version publie les capacités (le lanceur retire le DOM au boot)",
    asyncio.run(m.version())["features"] == ["scan"],
)
os.environ.pop("GW_FEATURES", None)
m = importlib.reload(main)

# La liste vit en DEUX langues : le défaut Python et le repli JS (utilisé quand
# /api/version échoue). Si elles divergent, la panne est MUETTE — un pod dont
# l'appel rate exposerait un jeu de contrôles différent de sa config. Et une
# capacité listée mais non câblée dans `applyFeatures` serait ingérable en silence.
import re  # noqa: E402

_JS = (Path(__file__).resolve().parents[1]
       / "frontend" / "src" / "launcher" / "main.js").read_text(encoding="utf-8")
_fallback = re.search(r"FEATURES_FALLBACK\s*=\s*\[([^\]]*)\]", _JS)
_js_features = re.findall(r"'([^']+)'", _fallback.group(1)) if _fallback else []
check("le repli JS liste les mêmes capacités que le défaut serveur",
      _js_features == m.FEATURES)

_apply = re.search(r"function applyFeatures\(\)\s*\{(.*?)\n\}", _JS, re.S)
_wired = set(re.findall(r"featureOn\('([^']+)'\)", _apply.group(1))) if _apply else set()
check("chaque capacité est réellement câblée dans applyFeatures",
      _wired == set(m.FEATURES))

print("\n--- l'état de l'instance, dit à l'agent (system_prompt.append) ---")

for var in ("GW_APPS", "GW_FEATURES"):
    os.environ.pop(var, None)
m = importlib.reload(main)
sp = m._system_prompt()
check("le preset claude_code est conservé (on AJOUTE, on ne remplace pas)",
      sp["type"] == "preset" and sp["preset"] == "claude_code")
check("les modules actifs sont annoncés à l'agent", "voyages" in sp["append"])
check("les capacités de la coque aussi", "scan" in sp["append"])

m = load("todo")
check("un module éteint n'est PAS annoncé (tout le point du chantier)",
      "voyages" not in m._system_prompt()["append"])

m = load("")
check("aucun module -> on le dit, plutôt qu'une énumération vide",
      "aucun" in m._system_prompt()["append"])

# L'état, et RIEN d'autre : le corps n'a pas à documenter un format ni un métier.
# Un préambule qui se met à expliquer comment écrire une fiche est un préambule
# qui vient de reprendre la place du workspace.
check("le préambule reste court (c'est un état, pas un contrat)",
      len(m._system_prompt()["append"]) < 400)

for var in ("GW_APPS", "GW_FEATURES"):
    os.environ.pop(var, None)
m = importlib.reload(main)

# LE piège de ce chantier, verrouillé par un test : les options du SDK se
# construisent à DEUX endroits — `_run_alfred` (tours MCP et planifiés) et
# `run_turn` (la PWA). N'en câbler qu'un laisse un canal entier aveugle, et ça ne
# se voit sur AUCUN écran. On interdit donc le littéral.
_PY = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(encoding="utf-8")
check("aucun preset littéral hors de _system_prompt (sinon un canal reste aveugle)",
      _PY.count('"preset": "claude_code"') == 1)
check("CHAQUE ClaudeAgentOptions reçoit l'état de l'instance",
      _PY.count("system_prompt=_system_prompt()") == _PY.count("ClaudeAgentOptions("))

print("\n--- les contrats de format, livrés par l'image (plugins) ---")

import json as _pj  # noqa: E402

for var in ("GW_APPS", "GW_FEATURES"):
    os.environ.pop(var, None)
m = importlib.reload(main)

_names = lambda mod: [os.path.basename(p["path"]) for p in mod._module_plugins()]

check("le socle `fiches` est TOUJOURS chargé (la mémoire n'est pas un module)",
      "fiches" in _names(m))
check("chaque plugin est déclaré local (seul type supporté par le SDK)",
      all(p["type"] == "local" for p in m._module_plugins()))
check("les chemins existent vraiment (un --plugin-dir fantôme fait échouer le CLI)",
      all(os.path.isdir(p["path"]) for p in m._module_plugins()))

m = load("voyages,atelier")
check("un module actif apporte son contrat",
      {"voyages", "atelier"} <= set(_names(m)))

m = load("todo")
check("un module ÉTEINT n'apporte pas le sien (tout le point du chantier)",
      "voyages" not in _names(m) and "atelier" not in _names(m))
check("un module sans contrat propre ne réclame rien (`todo` n'a pas de format)",
      _names(m) == ["fiches"])

m = load("fiches,fiches")
check("aucun doublon de chemin même si le socle est aussi listé dans GW_APPS",
      len(_names(m)) == len(set(_names(m))))

# Un plugin Claude Code est un DOSSIER portant un manifeste et des skills. Sans le
# manifeste, le CLI ignore le dossier en silence : le contrat ne partirait pas, et
# l'agent écrirait au jugé sans qu'aucune erreur ne le dise.
_PLUG = Path(__file__).resolve().parents[1] / "plugins"
for d in sorted(p for p in _PLUG.iterdir() if p.is_dir()):
    manifest = d / ".claude-plugin" / "plugin.json"
    check("%s : manifeste présent et valide" % d.name,
          manifest.is_file() and _pj.loads(manifest.read_text())["name"] == d.name)
    skills = sorted((d / "skills").glob("*/SKILL.md")) if (d / "skills").is_dir() else []
    check("%s : au moins une skill, avec frontmatter" % d.name,
          bool(skills) and all(s.read_text(encoding="utf-8").startswith("---") for s in skills))

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

print("\n--- actifs d'habillage (favicon, manifeste) ---")

import json as _json  # noqa: E402
from xml.etree import ElementTree  # noqa: E402

os.environ["GW_THEME"] = "skippy"
m = importlib.reload(main)
icon = m._skin_asset("icon.svg")
check("skippy sert SON icône", icon and icon.parts[-3:] == ("skins", "skippy", "icon.svg"))
mf = _json.loads(bytes(asyncio.run(m.manifest()).body).decode())
check("manifeste au nom du skin", mf["name"] == "Skippy")
check("couleurs du skin", mf["theme_color"] == "#080A0D")
check("icône du manifeste = la route thémée", mf["icons"][0]["src"] == "/icon.svg")

os.environ["GW_THEME"] = "alfred"
m = importlib.reload(main)
check("le socle garde son icône historique", m._skin_asset("icon.svg").name == "icon.svg"
      and "skins" not in str(m._skin_asset("icon.svg")))
check("le socle garde son nom", _json.loads(bytes(asyncio.run(m.manifest()).body).decode())["name"] == "Alfred")

os.environ["GW_THEME"] = "fantome"
m = importlib.reload(main)
check("skin inconnu -> repli sur le socle, jamais un 404",
      "skins" not in str(m._skin_asset("icon.svg")))
os.environ.pop("GW_THEME", None)
m = importlib.reload(main)

# Régression vécue en prod (0.40.0) : sortie de /static/, l'icône est retombée
# derrière le SSO et répondait 307 vers le login. La page de connexion s'affichait
# donc sans favicon, et l'installateur de PWA — qui fetche l'icône du manifeste
# sans forcément joindre le cookie — n'avait rien.
check("/icon.svg est publique, comme le /static/ d'où elle vient",
      "/icon.svg" in m._PUBLIC_PATHS)
check("le manifeste l'est aussi", "/manifest.webmanifest" in m._PUBLIC_PATHS)

for svg in (m.STATIC_DIR / "icon.svg", m.STATIC_DIR / "skins" / "skippy" / "icon.svg"):
    try:
        ElementTree.parse(svg)
        ok = True
    except Exception:
        ok = False
    check("SVG bien formé : %s" % svg.name if "skins" not in str(svg) else "SVG bien formé : skippy", ok)

print("\n--- GW_AGENT : l'identité de la surface MCP ---")


def tools_of(mod):
    return [t.name for t in asyncio.run(mod.mcp_server.list_tools())]


for var in ("GW_AGENT", "GW_MCP_DESCRIPTION", "GW_MCP_ALLOWED_HOSTS"):
    os.environ.pop(var, None)
m = importlib.reload(main)
check("défaut -> alfred (le majordome ne bouge pas)", m.AGENT == "alfred")
check("outils ask_alfred + son statut", sorted(tools_of(m)) == ["ask_alfred", "ask_alfred_status"])
check("hôte MCP dérivé de l'agent", m.MCP_ALLOWED_HOSTS == ["alfred.berard.me"])

os.environ["GW_AGENT"] = "skippy"
os.environ["GW_MCP_DESCRIPTION"] = "Confie une tâche technique à Skippy."
m = importlib.reload(main)
check("GW_AGENT=skippy -> outils ask_skippy + son statut",
      sorted(tools_of(m)) == ["ask_skippy", "ask_skippy_status"])
check("serveur MCP renommé aussi", m.mcp_server.name == "skippy")
# Sans dérivation, l'hôte serait resté alfred.berard.me et FastMCP aurait répondu
# 421 sur skippy.berard.me : la protection anti-rebinding DNS valide le Host.
check("hôte suit l'agent (sinon 421 sur son propre domaine)",
      m.MCP_ALLOWED_HOSTS == ["skippy.berard.me"])
check("description du corps servie aux autres agents",
      asyncio.run(m.mcp_server.list_tools())[0].description.startswith("Confie une tâche"))

os.environ["GW_MCP_ALLOWED_HOSTS"] = "a.example,b.example"
m = importlib.reload(main)
check("surcharge explicite des hôtes respectée",
      m.MCP_ALLOWED_HOSTS == ["a.example", "b.example"])

for var in ("GW_AGENT", "GW_MCP_DESCRIPTION", "GW_MCP_ALLOWED_HOSTS"):
    os.environ.pop(var, None)
m = importlib.reload(main)

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
