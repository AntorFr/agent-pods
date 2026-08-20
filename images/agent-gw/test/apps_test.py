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
    """Recharge le module avec un GW_APPS donné (None = variable absente).

    ⚠️ `GW_FEATURES` et `GW_THEME` sont neutralisés ici AUSSI, alors qu'aucun cas
    de cette section ne les manipule : le cas `/api/version` compare le dict
    ENTIER, donc il lisait les valeurs du pod dans lequel on lance le banc. Sur un
    corps réel (Skippy sert `attach,eph,tunnel,sujets` et le thème `skippy`) le
    test échouait sans qu'aucun code ne soit en cause — un banc qui dépend de son
    hôte n'apprend rien à personne.
    """
    for var in ("GW_APPS", "GW_FEATURES", "GW_THEME", "GW_TOOLS"):
        os.environ.pop(var, None)
    if value is not None:
        os.environ["GW_APPS"] = value
    return importlib.reload(main)


def load_tools(value):
    """Idem, sur le TROISIÈME axe (`GW_TOOLS`) — les capacités de l'agent."""
    for var in ("GW_APPS", "GW_FEATURES", "GW_THEME", "GW_TOOLS"):
        os.environ.pop(var, None)
    if value is not None:
        os.environ["GW_TOOLS"] = value
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
        "tools": [],
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

# Une capacité est câblée de DEUX façons désormais, et l'invariant est qu'elle le
# soit par l'une ou par l'autre — jamais par aucune :
#   - la coque la porte et `applyFeatures` la RETIRE quand elle est éteinte ;
#   - un plugin de sorte `capacite` l'AJOUTE (dossier plugins/<id>/web/chrome.js),
#     et `applyChrome` la pose dans l'emplacement du composeur ou des Réglages.
# Une capacité listée mais câblée nulle part serait ingérable en silence : la
# variable la promet, aucun bouton n'apparaît, et rien ne le dit.
_apply = re.search(r"function applyFeatures\(\)\s*\{(.*?)\n\}", _JS, re.S)
_wired = set(re.findall(r"featureOn\('([^']+)'\)", _apply.group(1))) if _apply else set()
_par_plugin = {d.name for d in (Path(__file__).resolve().parents[1] / "plugins").iterdir()
               if (d / "web" / "chrome.js").is_file()}
check("chaque capacité est câblée — par la coque OU par un plugin",
      set(m.FEATURES) <= (_wired | _par_plugin))
check("le scanner est bien passé du côté plugin (il n'est plus dans la coque)",
      "scan" in _par_plugin and "scan" not in _wired)

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

print("\n--- GW_TOOLS : les capacités de l'agent (troisième axe) ---")

m = load_tools(None)
check("absent -> aucun outil (une capacité ne s'allume pas toute seule)", m.TOOLS == [])
check("un plugin `outil` éteint n'apporte pas son contrat",
      "git" not in _names(m))
check("…et son API n'est pas montée non plus",
      not any(p.id == "git" for p in m.PLUGINS_ACTIVE))

m = load_tools("git")
check("nommé -> actif, et son contrat part", "git" in _names(m))
check("publié sur /api/version (les Réglages disent ce que ce corps sait faire)",
      asyncio.run(m.version())["tools"] == ["git"])
check("un outil n'est PAS un module (il n'a aucun pixel)", "git" not in m.APPS)
check("l'agent l'apprend dans les faits d'instance",
      any(f.startswith("outils — git") for f in m._instance_facts()))

m = load_tools("git, , inconnu ")
check("espaces rognés, entrées vides ignorées", m.TOOLS == ["git", "inconnu"])
check("un outil nommé mais non livré n'invente rien",
      not any(p.id == "inconnu" for p in m.PLUGINS_ACTIVE))

print("\n--- l'arborescence des plugins (contrat : plugins/README.md) ---")

# Un plugin est un DOSSIER portant `gw-plugin.json`. Le contrat Claude Code
# (`.claude-plugin/` + `skills/`) est OPTIONNEL depuis que « plugin » ne veut plus
# dire « contrat de format » : `parcours` et `repos` n'apportent qu'une API. Ce qui
# n'est pas optionnel, c'est que ce qui est déclaré soit valide — un manifeste muet
# ferait ignorer le dossier en silence, et personne n'en saurait rien.
_PLUG = Path(__file__).resolve().parents[1] / "plugins"
_DIRS = sorted(p for p in _PLUG.iterdir() if p.is_dir())

check("tout dossier de plugins/ porte un manifeste (sinon il n'est pas découvert)",
      all((d / "gw-plugin.json").is_file() for d in _DIRS))

for d in _DIRS:
    gw = _pj.loads((d / "gw-plugin.json").read_text(encoding="utf-8"))
    check("%s : id = nom du dossier, kind connu" % d.name,
          gw.get("id") == d.name and gw.get("kind") in ("socle", "app", "outil", "capacite"))
    # La VUE — le quatrième apport possible d'un plugin, à côté des skills, de
    # l'API et des exécutables. Deux moitiés qui doivent aller ensemble : la clé
    # `vue` pose une tuile dans le lanceur, `web/app.js` fournit l'écran qu'elle
    # ouvre. Une tuile sans écran est un cul-de-sac cliquable ; l'inverse (un
    # écran sans tuile) est LÉGITIME — c'est une vue de détail, atteinte par sa
    # route depuis une autre page.
    if "vue" in gw:
        check("%s : la tuile déclarée a bien son écran (web/app.js)" % d.name,
              (d / "web" / "app.js").is_file())
        check("%s : la tuile porte un libellé et une couleur" % d.name,
              bool(gw["vue"].get("label")) and bool(gw["vue"].get("color")))
    manifest = d / ".claude-plugin" / "plugin.json"
    if manifest.is_file():
        check("%s : manifeste Claude valide" % d.name,
              _pj.loads(manifest.read_text())["name"] == d.name)
        skills = sorted((d / "skills").glob("*/SKILL.md"))
        check("%s : au moins une skill, avec frontmatter" % d.name,
              bool(skills) and all(s.read_text(encoding="utf-8").startswith("---") for s in skills))

# Le corps ne doit atteindre AUCUN plugin en particulier : c'est la propriété qui
# rend un plugin tiers possible, et elle se casse en silence — un `import` de
# complaisance ne fait rien tomber, il rend juste le dossier `plugins/` décoratif.
#
# ⚠️ On ne teste PAS « le nom d'un plugin n'apparaît pas dans main.py » : « repos »
# et « fiches » sont aussi des mots français, et la version naïve de ce test a
# échoué sur un commentaire parlant de fiches de mémoire. On teste les DEUX gestes
# qui percent réellement la frontière : construire un chemin, ou importer.
_MAIN = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(encoding="utf-8")
check("le corps ne construit aucun chemin vers un plugin",
      "PLUGINS_DIR" not in _MAIN)
check("le corps n'importe aucun module de plugin",
      not re.search(r"^\s*from\s+\.?plugins[. ]", _MAIN, re.M))
check("la découverte est bien déléguée au socle",
      "plugin_host.discover()" in _MAIN and "plugin_host.claude_plugins" in _MAIN)

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

# Balayage de TOUS les skins livrés, et pas d'un nom en dur : le contrôle a été
# écrit pour `skippy` seul, si bien que le skin `nestor` aurait pu partir sans
# icône ni manifeste sans qu'une seule assertion ne bronche. Ajouter un corps ne
# doit rien réclamer ici.
#
# ⚠️ La SOURCE fait foi, plus le dossier servi : depuis que les skins vivent dans
# `skins/<id>/`, leurs actifs sont installés vers `static/skins/` PAR LE
# DOCKERFILE. Ils n'existent donc pas dans le dépôt, et un banc qui lisait le
# dossier servi ne testait plus rien ici — il échouait, ce qui vaut mieux, mais
# il aurait pu silencieusement ne trouver aucun skin et se déclarer content si
# l'assertion « au moins un » n'était pas là.
_SKINS_DIR = Path(__file__).resolve().parents[1] / "skins"
_SKINS = sorted(d.name for d in _SKINS_DIR.iterdir()
                if d.is_dir() and (d / "assets").is_dir())
check("au moins un skin livre ses actifs", bool(_SKINS))
check("chaque skin declare son manifeste",
      all((_SKINS_DIR / s / "gw-skin.json").is_file()
          for s in (d.name for d in _SKINS_DIR.iterdir() if d.is_dir())))
# Le CONTENU des actifs, à la source. Comparé au fichier du skin et jamais à des
# valeurs recopiées : un manifeste modifié sans que le banc suive serait un banc
# qui se ment à lui-même.
for _skin in _SKINS:
    _man = _json.loads((_SKINS_DIR / _skin / "assets" / "manifest.json").read_text(encoding="utf-8"))
    check("%s : son manifeste nomme le corps" % _skin, bool(_man.get("name")))
    check("%s : il livre aussi son icône" % _skin,
          (_SKINS_DIR / _skin / "assets" / "icon.svg").is_file())

# Le SERVICE des actifs, sur une arborescence fabriquée. C'est le Dockerfile qui
# installe `skins/<id>/assets/` vers `static/skins/<id>/` : le dépôt ne porte donc
# PAS le dossier servi, et tester `_skin_asset` contre le disque du dépôt ne
# prouverait rien. On lui fabrique le monde qu'il verra dans l'image.
_faux = Path(tempfile.mkdtemp())
(_faux / "skins" / "zeta").mkdir(parents=True)
(_faux / "icon.svg").write_text("<svg/>", encoding="utf-8")
(_faux / "skins" / "zeta" / "icon.svg").write_text("<svg/>", encoding="utf-8")
_avant = main.STATIC_DIR
main.STATIC_DIR = _faux
os.environ["GW_THEME"] = "zeta"
m = importlib.reload(main)
m.STATIC_DIR = _faux
check("un skin sert SON actif quand il en a un",
      m._skin_asset("icon.svg").parts[-3:] == ("skins", "zeta", "icon.svg"))
check("il retombe sur le socle pour ce qu'il ne fournit pas",
      m._skin_asset("manifest.json") is None
      and m._skin_asset("icon.svg") is not None)
os.environ["GW_THEME"] = "inconnu"
m = importlib.reload(main)
m.STATIC_DIR = _faux
check("un thème sans dossier retombe sur le socle, jamais sur rien",
      m._skin_asset("icon.svg") == _faux / "icon.svg")
main.STATIC_DIR = _avant

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

for svg in [m.STATIC_DIR / "icon.svg"] + [_SKINS_DIR / s / "assets" / "icon.svg" for s in _SKINS]:
    try:
        ElementTree.parse(svg)
        ok = True
    except Exception:
        ok = False
    check("SVG bien formé : %s" % (svg.parent.name if svg.parent.name != "static" else svg.name), ok)

print("\n--- GW_AGENT : l'identité de la surface MCP ---")


def tools_of(mod):
    return [t.name for t in asyncio.run(mod.mcp_server.list_tools())]


for var in ("GW_AGENT", "GW_MCP_DESCRIPTION", "GW_MCP_ALLOWED_HOSTS"):
    os.environ.pop(var, None)
m = importlib.reload(main)
check("défaut -> alfred (le majordome ne bouge pas)", m.AGENT == "alfred")
check("outils ask_alfred + son statut", sorted(tools_of(m)) == ["ask_alfred", "ask_alfred_status"])
# L'hôte n'est PLUS dérivé de l'agent : le défaut valait `<agent>.<domaine>`,
# c'est-à-dire un domaine privé dans une image publique. Vide par défaut — seuls
# les hôtes locaux, ajoutés par le code, restent acceptés. Un corps qui expose son
# /mcp au-dehors DOIT déclarer son nom, et c'est très bien : cette liste EST la
# garde anti-rebinding, la deviner n'a jamais eu de sens.
check("aucun hôte deviné (plus de domaine privé en défaut)",
      m.MCP_ALLOWED_HOSTS == [])

os.environ["GW_AGENT"] = "skippy"
os.environ["GW_MCP_DESCRIPTION"] = "Confie une tâche technique à Skippy."
m = importlib.reload(main)
check("GW_AGENT=skippy -> outils ask_skippy + son statut",
      sorted(tools_of(m)) == ["ask_skippy", "ask_skippy_status"])
check("serveur MCP renommé aussi", m.mcp_server.name == "skippy")
# ⚠️ Le nom de l'agent ne fabrique plus d'hôte. Corollaire à ne pas rater : un pod
# appelé depuis l'extérieur DOIT poser GW_MCP_ALLOWED_HOSTS, sinon FastMCP répond
# 421 — la validation du Host étant sa protection anti-rebinding DNS. Les trois
# manifestes le posent déjà ; c'est ce qui rend ce défaut vide sans danger.
check("changer d'agent ne fabrique aucun hôte", m.MCP_ALLOWED_HOSTS == [])
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
