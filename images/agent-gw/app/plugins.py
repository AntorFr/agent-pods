"""Le socle des plugins — comment le corps découvre ce qu'on lui a livré.

Le corps ne connaît **aucun** plugin par son nom : il lit les dossiers de
`plugins/`, décide lesquels sont actifs, et branche ce qu'ils apportent. C'est
cette ignorance qui rend un plugin déposable depuis un autre dépôt ; tout ce qui
la percerait (un `import` en dur, une liste de noms) casse la propriété.

Le contrat complet — l'arborescence, les quatre sortes, ce qui reste dans le corps
et pourquoi — vit dans `plugins/README.md`. Ici : ce qui l'exécute.

Le principe de conception, unique : **la présence du fichier au bon nom suffit.**
Rien ne se déclare dans le manifeste au-delà de l'identité et de la sorte, donc
rien ne peut mentir sur ce que le dossier contient réellement.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

# `<parent de app>/plugins` — le Dockerfile y copie le dossier tel quel.
PLUGINS_DIR = Path(__file__).resolve().parent.parent / "plugins"
MANIFEST = "gw-plugin.json"

# Les quatre sortes, et l'axe qui décide de l'activité de chacune.
KIND_ALWAYS = "socle"       # toujours actif
KIND_APP = "app"            # actif si l'id est dans GW_APPS
KIND_TOOL = "outil"         # actif si l'id est dans GW_TOOLS
# Une capacité de la COQUE — un contrôle du composeur, une entrée des Réglages.
# Gardée par `GW_FEATURES`, l'axe qui existait déjà pour ça : un plugin de cette
# sorte se déclare donc EXACTEMENT là où sa fonctionnalité se déclarait avant,
# et aucun manifeste de pod ne bouge le jour où elle devient un plugin.
KIND_FEATURE = "capacite"   # actif si l'id est dans GW_FEATURES
KINDS = (KIND_ALWAYS, KIND_APP, KIND_TOOL, KIND_FEATURE)

SETUP_TIMEOUT = 30.0


def _warn(message: str) -> None:
    """Un plugin qui déraille se dit à voix haute, sur stderr.

    Le silence est le pire mode de défaillance ici : un contrat qu'on croit parti
    et qui n'est pas parti ne produit aucun symptôme avant que l'agent écrive
    n'importe quoi, des jours plus tard.
    """
    print("plugins: " + message, file=sys.stderr, flush=True)


@dataclass(frozen=True)
class Plugin:
    """Un dossier de `plugins/` qui porte un manifeste lisible."""

    id: str
    kind: str
    path: Path
    description: str = ""

    @property
    def claude_manifest(self) -> Path:
        return self.path / ".claude-plugin" / "plugin.json"

    @property
    def api_file(self) -> Path:
        return self.path / "api.py"

    @property
    def setup_file(self) -> Path:
        return self.path / "setup"


def discover(root: Path | None = None) -> list[Plugin]:
    """Les plugins livrés, triés par id (ordre stable = logs comparables).

    Un dossier sans `gw-plugin.json` n'est pas un plugin — on passe sans rien
    dire : c'est ainsi qu'on range un `README.md` ou un dossier de travail ici
    sans que le corps essaie de le charger.
    """
    root = root or PLUGINS_DIR
    found: list[Plugin] = []
    if not root.is_dir():
        return found

    for folder in sorted(p for p in root.iterdir() if p.is_dir()):
        manifest = folder / MANIFEST
        if not manifest.is_file():
            continue
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            _warn(f"« {folder.name} » ignoré — manifeste illisible ({exc})")
            continue

        kind = str(data.get("kind", "")).strip()
        if kind not in KINDS:
            _warn(
                f"« {folder.name} » ignoré — kind « {kind or '?' } » inconnu "
                f"(attendu : {', '.join(KINDS)})"
            )
            continue

        # Le DOSSIER fait foi : c'est son nom qu'on écrit dans GW_APPS/GW_TOOLS.
        # Un manifeste qui prétend autre chose créerait un plugin qu'on ne peut
        # pas allumer — on le signale plutôt que de le laisser silencieux.
        declared = str(data.get("id", "")).strip()
        if declared and declared != folder.name:
            _warn(
                f"« {folder.name} » : le manifeste déclare l'id « {declared} », "
                "le nom du dossier fait foi"
            )

        found.append(
            Plugin(
                id=folder.name,
                kind=kind,
                path=folder,
                description=str(data.get("description", "")).strip(),
            )
        )
    return found


def is_active(plugin: Plugin, apps: list[str], tools: list[str],
              features: list[str] | None = None) -> bool:
    """Un plugin est actif si l'axe de sa sorte le nomme."""
    if plugin.kind == KIND_ALWAYS:
        return True
    if plugin.kind == KIND_APP:
        return plugin.id in apps
    if plugin.kind == KIND_TOOL:
        return plugin.id in tools
    if plugin.kind == KIND_FEATURE:
        return plugin.id in (features or [])
    return False


def active(plugins: list[Plugin], apps: list[str], tools: list[str],
           features: list[str] | None = None) -> list[Plugin]:
    return [p for p in plugins if is_active(p, apps, tools, features)]


def claude_plugins(plugins: list[Plugin]) -> list[dict]:
    """Ce qu'on passe à `ClaudeAgentOptions.plugins`.

    Filtré sur la présence de `.claude-plugin/plugin.json` : un plugin qui n'a
    qu'une API n'a pas de contrat à livrer, et le SDK échouerait à lire un dossier
    qui n'est pas un plugin Claude Code.
    """
    return [
        {"type": "local", "path": str(p.path)}
        for p in plugins
        if p.claude_manifest.is_file()
    ]


def api_module(plugin: Plugin):
    """Importe `plugins/<id>/api.py`, ou rend None s'il n'y en a pas.

    `importlib` et pas un `import` ordinaire : `plugins/` n'est pas un paquet, et
    surtout le corps ne connaît pas la liste à l'écriture — c'est tout le propos.
    Le nom de module est préfixé pour ne jamais entrer en collision avec un paquet
    installé, et mémorisé dans `sys.modules` pour que deux appels rendent le même
    objet (le routeur est monté une fois, les tests le rechargent).
    """
    if not plugin.api_file.is_file():
        return None
    name = f"gw_plugin_{plugin.id}"
    cached = sys.modules.get(name)
    if cached is not None:
        return cached
    spec = importlib.util.spec_from_file_location(name, plugin.api_file)
    if spec is None or spec.loader is None:
        raise ImportError(f"spec introuvable pour {plugin.api_file}")
    module = importlib.util.module_from_spec(spec)
    # Enregistré AVANT l'exécution : un module qui s'importe lui-même (ou dont une
    # dépendance le fait) trouverait sinon un trou.
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(name, None)
        raise
    return module


def routers(plugins: list[Plugin]) -> list[tuple[Plugin, object]]:
    """Les routeurs des plugins actifs, dans l'ordre de découverte.

    Une API qui refuse de s'importer est signalée et SAUTÉE. Faire tomber la
    gateway entière pour un module en défaut serait un mauvais échange : on perd
    une vue au lieu de tout perdre, et le message dit laquelle.
    """
    out: list[tuple[Plugin, object]] = []
    for plugin in plugins:
        try:
            module = api_module(plugin)
        except Exception as exc:  # noqa: BLE001 — on ne fait pas tomber le corps
            _warn(f"« {plugin.id} » : API non chargée ({exc!r})")
            continue
        router = getattr(module, "router", None) if module is not None else None
        if router is not None:
            out.append((plugin, router))
    return out


def run_setups(plugins: list[Plugin]) -> None:
    """Lance le `setup` de chaque plugin actif qui en a un.

    Relancé à CHAQUE démarrage, d'où l'exigence d'idempotence : c'est ce qui fait
    survivre un câblage à la recréation d'un pod, là où une commande tapée à la
    main disparaissait avec lui.
    """
    for plugin in plugins:
        script = plugin.setup_file
        if not script.is_file():
            continue
        if not os.access(script, os.X_OK):
            _warn(f"« {plugin.id} » : setup présent mais non exécutable, ignoré")
            continue
        try:
            done = subprocess.run(
                [str(script)],
                capture_output=True,
                text=True,
                timeout=SETUP_TIMEOUT,
                cwd=str(plugin.path),
            )
        except Exception as exc:  # noqa: BLE001 — idem : on n'empêche pas le boot
            _warn(f"« {plugin.id} » : setup en échec ({exc!r})")
            continue
        output = (done.stdout or "").strip() or (done.stderr or "").strip()
        if done.returncode != 0:
            _warn(f"« {plugin.id} » : setup sorti en {done.returncode} — {output}")
        elif output:
            print(f"plugins: « {plugin.id} » setup — {output}", flush=True)
