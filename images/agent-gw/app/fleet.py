"""Vue `repos` — agrège les `.agent/status.md` d'une flotte de dépôts clonés.

Raison d'être du pod de code : un scan qui répond « où en est chaque projet, et
qu'est-ce qui attend un geste ? » sans ouvrir vingt-trois dossiers.

Source : les clones locaux sous `<workspace>/<FLEET_DIR>/`. On lit le disque, pas
l'API GitHub — le pod n'a qu'un jeton de LECTURE et pas de dépendance réseau ici.
La contrepartie est assumée : ce qui s'affiche est ce que le pod a **fetché**, un
`git fetch` reste donc un geste utile.

Ce module ne fait AUCUNE écriture. Il exécute `git` en lecture seule (log/status),
avec un timeout court : un dépôt corrompu ralentit sa carte, jamais la page.
"""

from __future__ import annotations

import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Chemin de la fiche, dans l'ordre de préférence. Le second est l'ancienne
# convention : deux dépôts la portent encore, l'agrégateur les tolère plutôt que
# de les afficher comme « sans fiche » — ce serait un mensonge.
STATUS_PATHS = (".agent/status.md", "STATUS.md")

_GIT_TIMEOUT = 5
_SPARK_DAYS = 30


def _git(repo: Path, *args: str) -> str:
    """git en lecture seule, borné. Renvoie "" sur tout échec — un dépôt cassé
    est une carte pauvre, jamais une exception qui casse la vue."""
    try:
        out = subprocess.run(
            ("git", "-C", str(repo), *args),
            capture_output=True, text=True, timeout=_GIT_TIMEOUT, check=False,
        )
        return out.stdout.strip() if out.returncode == 0 else ""
    except Exception:
        return ""


def _activity(repo: Path) -> list[int]:
    """Commits par jour sur les 30 derniers jours, du plus ancien au plus récent.
    Alimente la sparkline ; une liste de zéros est une information valable."""
    raw = _git(repo, "log", f"--since={_SPARK_DAYS}.days", "--format=%ct")
    buckets = [0] * _SPARK_DAYS
    if not raw:
        return buckets
    midnight = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    for line in raw.splitlines():
        try:
            when = datetime.fromtimestamp(int(line), tz=timezone.utc)
        except ValueError:
            continue
        days_ago = (midnight - when).days
        if 0 <= days_ago < _SPARK_DAYS:
            buckets[_SPARK_DAYS - 1 - days_ago] += 1
    return buckets


def _plain(md: str) -> str:
    """Markdown → texte nu. La carte affiche une ligne, pas du balisage : les
    `**gras**` et les `` `code` `` doivent se lire, pas s'afficher."""
    md = re.sub(r"\*\*(.+?)\*\*", r"\1", md)
    md = re.sub(r"`([^`]+)`", r"\1", md)
    md = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", md)   # liens -> leur libellé
    return md.replace("**", "").strip()


def _parse_status(text: str) -> dict:
    """Extrait l'état et les étapes ouvertes d'une fiche `.agent/status.md`.

    Le format est ultra-light mais pas rigide : certaines fiches ouvrent sur
    `**État :** …`, d'autres empilent des entrées datées `**<titre> — DÉPLOYÉ…**`.
    On prend le premier paragraphe en gras dans les deux cas, ce qui donne
    toujours « la dernière chose qui compte ». Les étapes retenues sont les cases
    NON cochées : une carte affiche ce qui reste, pas ce qui est fait.
    """
    maj = ""
    m = re.search(r"^>\s*M[àa]J\s*:\s*(.+)$", text, re.M)
    if m:
        maj = m.group(1).strip()

    # Le PREMIER paragraphe en gras, et lui seul. Les fiches empilent les entrées
    # les plus récentes en tête : chercher « **État :** » n'importe où remonterait
    # une entrée périmée du milieu du document (vécu sur agent-pods, dont la
    # section « État » date de trois paliers). Le haut de la fiche fait foi.
    etat = ""
    m = re.search(r"^\*\*(.+?)(?:\n\s*\n|\Z)", text, re.M | re.S)
    if m:
        body = m.group(1)
        # Enlève l'étiquette « État : » quand elle ouvre le paragraphe.
        body = re.sub(r"^[ÉE]tat\s*(?:\([^)]*\))?\s*:?\*\*\s*", "", body)
        etat = _plain(" ".join(body.split()))

    steps = [
        _plain(" ".join(s.split()))
        for s in re.findall(r"^\s*-\s*\[ \]\s*(.+?)(?=\n\s*-\s*\[|\n\s*\n|\Z)", text, re.M | re.S)
    ]
    return {"maj": maj, "etat": etat, "etapes": steps}


def scan(workspace: str, fleet_dir: str) -> dict:
    """Un passage sur la flotte. Trie : ce qui attend un geste d'abord."""
    root = (Path(workspace) / fleet_dir).resolve()
    repos: list[dict] = []
    if root.is_dir():
        for path in sorted(root.iterdir()):
            if not (path / ".git").exists():
                continue
            card: dict = {"nom": path.name, "fiche": False, "etat": "", "etapes": [], "maj": ""}
            for rel in STATUS_PATHS:
                fiche = path / rel
                if fiche.is_file():
                    try:
                        card.update(_parse_status(fiche.read_text(encoding="utf-8")))
                        card["fiche"] = True
                        card["source"] = rel
                    except OSError:
                        pass
                    break
            card["activite"] = _activity(path)
            card["dernier"] = _git(path, "log", "-1", "--format=%cI")
            card["branche"] = _git(path, "rev-parse", "--abbrev-ref", "HEAD")
            # « Sale » = des modifications non committées traînent dans le clone.
            card["sale"] = bool(_git(path, "status", "--porcelain"))
            repos.append(card)

    # Ce qui attend un geste remonte : c'est la seule question que pose ce tableau.
    repos.sort(key=lambda c: (not c["etapes"], not c["fiche"], c["nom"].lower()))
    return {
        "repos": repos,
        "total": len(repos),
        "avec_fiche": sum(1 for c in repos if c["fiche"]),
        "en_attente": sum(1 for c in repos if c["etapes"]),
        "racine": str(root),
    }
