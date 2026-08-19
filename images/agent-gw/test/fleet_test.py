"""Tests du scan de flotte (vue `repos`).

Sans réseau ni git : on nourrit le parseur directement, et on monte une fausse
flotte sur disque pour le scan. Lancer depuis images/agent-gw :
    python test/fleet_test.py
"""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Le module a déménagé dans son plugin (cf. plugins/README.md) : on le charge par le
# socle, comme le corps le fait au démarrage — pas par un chemin recopié à la main,
# qui mentirait le jour où l'arborescence bouge.
from app import plugins as plugin_host  # noqa: E402

fleet = plugin_host.api_module(
    next(p for p in plugin_host.discover() if p.id == "repos")
)

FAILS = []


def check(name, cond):
    print(("  ok  " if cond else "  FAIL") + "  " + name)
    if not cond:
        FAILS.append(name)


print("\n--- extraction de l'état ---")

# Cas réel qui a motivé le fix : une fiche empile les entrées, la plus RÉCENTE en
# tête, et garde plus bas une vieille section « État : ». C'est le haut qui fait foi.
EMPILEE = """# Status — demo

> MàJ : 2026-07-31

**Palier 3 — DÉPLOYÉ (2026-07-31)** : la dernière chose qui compte, avec du `code`
et du **gras** dedans.

**État :** vieille section datant de trois paliers, à ne surtout pas remonter.

**Prochaines étapes :**
- [x] déjà fait, ne doit pas apparaître
- [ ] taguer et déployer
- [ ] **relire** la garde
"""

p = fleet._parse_status(EMPILEE)
check("prend le PREMIER paragraphe en gras, pas la vieille section « État »",
      p["etat"].startswith("Palier 3 — DÉPLOYÉ"))
check("« vieille section » n'est pas remontée", "vieille section" not in p["etat"])
check("markdown nettoyé (ni ** ni backticks)", "**" not in p["etat"] and "`" not in p["etat"])
check("date de MàJ lue", p["maj"] == "2026-07-31")
check("seules les cases NON cochées comptent", p["etapes"] == ["taguer et déployer", "relire la garde"])

SIMPLE = """# Status — demo2

> MàJ : 2026-07-01

**État :** une ligne, format canonique.

**Prochaines étapes :**
- [ ] une étape
"""
p2 = fleet._parse_status(SIMPLE)
check("format canonique : l'étiquette « État : » est retirée", p2["etat"] == "une ligne, format canonique.")

p3 = fleet._parse_status("# Rien\n\nAucun gras, aucune case.\n")
check("fiche sans gras ni case -> vides, pas d'exception", p3["etat"] == "" and p3["etapes"] == [])

print("\n--- scan de la flotte ---")

root = Path(tempfile.mkdtemp())
fleet_dir = root / "repos"
(fleet_dir / "avec-fiche" / ".agent").mkdir(parents=True)
(fleet_dir / "avec-fiche" / ".git").mkdir()
(fleet_dir / "avec-fiche" / ".agent" / "status.md").write_text(EMPILEE, encoding="utf-8")
(fleet_dir / "ancienne-norme" / ".git").mkdir(parents=True)
(fleet_dir / "ancienne-norme" / "STATUS.md").write_text(SIMPLE, encoding="utf-8")
(fleet_dir / "sans-fiche" / ".git").mkdir(parents=True)
(fleet_dir / "pas-un-depot").mkdir()          # sans .git : ignoré

d = fleet.scan(str(root), "repos")
noms = [c["nom"] for c in d["repos"]]
check("un dossier sans .git est ignoré", "pas-un-depot" not in noms)
check("trois dépôts vus", d["total"] == 3)
check("workspace sans .git -> aucune carte cockpit", not any(c["cockpit"] for c in d["repos"]))
check("STATUS.md racine toléré (ancienne norme)", d["avec_fiche"] == 2)
check("ce qui attend un geste remonte en tête", noms[0] in ("avec-fiche", "ancienne-norme"))
check("le dépôt sans fiche est signalé, pas inventé",
      next(c for c in d["repos"] if c["nom"] == "sans-fiche")["fiche"] is False)
check("activité toujours présente, même vide", len(d["repos"][0]["activite"]) == 30)

d0 = fleet.scan(str(root), "flotte-inexistante")
check("racine absente -> vue vide, pas d'exception", d0["total"] == 0 and d0["repos"] == [])

print("\n--- le cockpit sur son propre tableau ---")
# Le workspace n'est pas un clone sous repos/ : il échappait au scan, et le
# tableau de bord ignorait le poste de pilotage.
(root / ".git").mkdir()
(root / ".agent").mkdir()
(root / ".agent" / "status.md").write_text(SIMPLE, encoding="utf-8")
dc = fleet.scan(str(root), "repos")
cockpits = [c for c in dc["repos"] if c["cockpit"]]
check("le cockpit apparaît", len(cockpits) == 1)
check("il ouvre le tableau", dc["repos"][0]["cockpit"] is True)
check("sa fiche est lue comme les autres", cockpits[0]["etat"].startswith("une ligne"))
check("il compte dans les totaux", dc["total"] == 4 and dc["avec_fiche"] == 3)
check("les autres cartes ne sont pas marquées cockpit",
      sum(1 for c in dc["repos"] if c["cockpit"]) == 1)

print("\nFAIL" if FAILS else "\nSPIKE OK")
sys.exit(1 if FAILS else 0)
