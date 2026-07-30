"""Tests du chemin de données de l'habillage déclaratif des domaines.

L'icône et la couleur d'un domaine vivent dans le frontmatter de son `INDEX.md` et
n'atteignent le lanceur que par `/api/memory/index`. Cette route est donc un contrat,
pas un détail : si elle cessait d'exposer les `INDEX.md` (ou d'en lire le frontmatter),
les tuiles retomberaient en livrée par défaut **sans erreur** — une panne muette.
D'où ces tests. Sans réseau ni SDK. Lancer depuis images/agent-gw :
    python test/habillage_test.py
"""

import asyncio
import os
import sys
import tempfile
from pathlib import Path

WS = Path(tempfile.mkdtemp())
os.environ["GW_WORKSPACE"] = str(WS)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.main as main  # noqa: E402

FAILS = []


def check(name, cond):
    print(("  ok  " if cond else "  FAIL") + "  " + name)
    if not cond:
        FAILS.append(name)


def write(rel, text):
    p = WS / "memory" / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


write(
    "domaines/sante/INDEX.md",
    "---\ntype: espace\ndomaine: sante\ntitre: Santé\nico: ❤️\ncouleur: rouge\n---\n\n# Santé\n",
)
# Un domaine non migré : aucun frontmatter, l'entrée doit exister quand même (repli).
write("domaines/cuisine/INDEX.md", "# Cuisine — recettes et proportions\n\nDe la prose.\n")
# `sujets` n'est pas sous domaines/ mais porte le même contrat.
write("sujets/INDEX.md", "---\ntype: espace\ntitre: Sujets\nico: 🧵\ncouleur: violet\n---\n")
# Un domaine dont l'INDEX ne déclare qu'un champ : les autres restent au repli.
write("domaines/admin/INDEX.md", "---\ntype: espace\nico: 🗄️\n---\n")

index = {it["path"]: it["fm"] for it in asyncio.run(main.memory_index())["items"]}

print("frontmatter des INDEX de domaine")
sante = index.get("domaines/sante/INDEX.md")
check("l'INDEX d'un domaine est indexé", sante is not None)
check("titre remonté", (sante or {}).get("titre") == "Santé")
check("emoji intact (pas de mangling unicode)", (sante or {}).get("ico") == "❤️")
check("couleur remontée", (sante or {}).get("couleur") == "rouge")

check("sujets/INDEX.md suit le même contrat", index.get("sujets/INDEX.md", {}).get("ico") == "🧵")

print("tolérance")
check("INDEX sans frontmatter : entrée présente, fm vide", index.get("domaines/cuisine/INDEX.md") == {})
admin = index.get("domaines/admin/INDEX.md", {})
check("déclaration partielle : ico seul, sans titre ni couleur",
      admin.get("ico") == "🗄️" and "titre" not in admin and "couleur" not in admin)

print("vocabulaire fermé — la liste du lanceur fait foi")
# Le front n'accepte que ces noms (const HUES, frontend/src/launcher/main.js) et
# ignore tout le reste : c'est ce qui interdit d'injecter du CSS depuis une fiche.
HUES = ["rouge", "orange", "ambre", "vert", "emeraude", "turquoise",
        "bleu", "indigo", "violet", "rose", "gris", "ardoise"]
src = (Path(__file__).resolve().parents[1] / "frontend/src/launcher/main.js").read_text(encoding="utf-8")
check("les 12 teintes documentées existent dans main.js",
      all((h + ":") in src for h in HUES))
check("AUTHORING.md documente le même vocabulaire",
      all(("`" + h + "`") in (Path(__file__).resolve().parents[1] / "frontend/AUTHORING.md").read_text(encoding="utf-8")
          for h in HUES))

print()
if FAILS:
    print(f"{len(FAILS)} échec(s) : " + ", ".join(FAILS))
    sys.exit(1)
print("HABILLAGE OK")
