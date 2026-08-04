"""Tests du PARCOURS — le GPX assemblé à la demande.

Le contrat tient en deux phrases. La géométrie décodée doit rendre EXACTEMENT
les points que le routeur a calculés, au mètre près : c'est toute la raison
d'être de l'encodage, et un décodeur qui dérive fabrique une trace fausse que
personne ne relit. Et la prose d'Alfred — description, note de contexte, lien —
doit arriver intacte dans le fichier que son téléphone ouvrira.

Sans réseau. Lancer depuis images/agent-gw :
    python test/parcours_test.py
"""

import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

WS = tempfile.mkdtemp()
os.environ["GW_WORKSPACE"] = WS
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import parcours  # noqa: E402

FAILS = []


def check(name, cond):
    print(("  ok  " if cond else "  FAIL") + "  " + name)
    if not cond:
        FAILS.append(name)


def encode_path(coords):
    """L'encodeur de l'addon `trace`, retranscrit ici pour fabriquer les
    fixtures : le test doit prouver que les DEUX bouts se comprennent."""
    out, plat, plng = [], 0, 0
    for lat, lng in coords:
        ilat, ilng = round(lat * 1e5), round(lng * 1e5)
        out.append(_chunk(ilat - plat))
        out.append(_chunk(ilng - plng))
        plat, plng = ilat, ilng
    return "".join(out)


def encode_series(values):
    out, prev = [], 0
    for v in values:
        cur = round(v)
        out.append(_chunk(cur - prev))
        prev = cur
    return "".join(out)


def _chunk(delta):
    delta = ~(delta << 1) if delta < 0 else (delta << 1)
    out = []
    while delta >= 0x20:
        out.append(chr((0x20 | (delta & 0x1F)) + 63))
        delta >>= 5
    out.append(chr(delta + 63))
    return "".join(out)


COORDS = [(47.65356, -2.75921), (47.654526, -2.758597), (47.655969, -2.757068),
          (47.654599, -2.757340), (47.65356, -2.75921)]
ALTITUDES = [4, 12, 24, 9, 4]

PARCOURS = {
    "titre": "Vannes — boucle de la ville close",
    "profil": "pieton",
    "reperes": [
        {"nom": "Départ — Parking du Port", "latlng": "47.65356,-2.75921",
         "desc": "Parking couvert, 9 rue du Port.", "sym": "Parking Area"},
        {"nom": "Bastion de Gréguennic", "latlng": "47.6545245,-2.7585968",
         "desc": "Bastion sud-ouest de l'enceinte.",
         "note": "À 27 m de la trace : le point vise le bastion, la trace suit le quai.",
         "web": "https://exemple.fr/bastion", "ecart_trace_m": 27},
        {"nom": "Place des Lices", "latlng": "47.6559693,-2.7570677",
         "desc": "Ancien champ de tournois « des ducs » & marché."},
    ],
    "trace": {
        "moteur": "BRouter / OpenStreetMap (profil hiking-beta)",
        "altimetrie": "routeur (BRouter)",
        "calcule_le": "2026-08-05",
        "distance_m": 3036,
        "denivele_pos_m": 30,
        "denivele_neg_m": 28,
        "points_trace": 5,
        "geometrie": encode_path(COORDS),
        "altitudes": encode_series(ALTITUDES),
    },
}


def test_decodage_fidele():
    got = parcours.decode(PARCOURS["trace"]["geometrie"])
    check("le décodage rend autant de points qu'encodés", len(got) == len(COORDS))
    ecarts = [max(abs(a - c), abs(b - d)) for (a, b), (c, d) in zip(COORDS, got)]
    check(f"aucun point ne dérive (max {max(ecarts):.7f}°)", max(ecarts) < 1e-5)
    alts = [v[0] for v in parcours.decode(PARCOURS["trace"]["altitudes"], factor=1, dims=1)]
    check("les altitudes reviennent en mètres entiers", alts == ALTITUDES)


def test_gpx_porte_la_trace_ET_les_reperes():
    gpx = parcours.build_gpx(PARCOURS)
    check("le GPX porte les 3 repères", gpx.count("<wpt ") == 3)
    check("le GPX porte les 5 points de trace", gpx.count("<trkpt ") == 5)
    # Beaucoup d'applications refusent un fichier sans <trk> (constaté sur la
    # boucle de Vannes, 2026-08-04) : la trace n'est pas décorative.
    check("le GPX porte une trace <trk>", "<trk>" in gpx and "<trkseg>" in gpx)
    check("les altitudes sont écrites", "<ele>24</ele>" in gpx)
    check("les repères sont numérotés", "<name>1. Départ — Parking du Port</name>" in gpx)


def test_la_prose_d_alfred_survit():
    gpx = parcours.build_gpx(PARCOURS)
    check("la description arrive", "Bastion sud-ouest de l'enceinte." in gpx)
    # La note de contexte est ce qu'Alfred ajoute de sa main : la perdre, c'est
    # perdre exactement ce que la machine ne savait pas.
    check("la note de contexte arrive aussi", "le point vise le bastion" in gpx)
    check("le lien devient un <link> GPX", '<link href="https://exemple.fr/bastion">' in gpx)
    check("le symbole est repris", "<sym>Parking Area</sym>" in gpx)


def test_le_gpx_est_du_XML_valide_meme_hostile():
    """Le seul test qui compte sur l'échappement : le fichier doit PARSER.
    Comparer des chaînes ne prouve rien — `quoteattr` bascule légitimement sur
    des apostrophes quand la valeur contient un guillemet, et une assertion
    ficelle crie alors au loup sur du XML parfaitement valide.
    """
    import xml.etree.ElementTree as ET

    NS = "{http://www.topografix.com/GPX/1/1}"
    racine = ET.fromstring(parcours.build_gpx(PARCOURS))
    check("le GPX nominal parse", racine.tag == f"{NS}gpx")
    descs = [e.text for e in racine.iter(f"{NS}desc")]
    check("l'esperluette d'une description traverse intacte",
          any("« des ducs » & marché" in (d or "") for d in descs))

    hostile = {"titre": "A & B <script>", "reperes": [
        {"nom": 'Guillemets "durs" & <b>', "latlng": "47.1,-2.1",
         "desc": "]]> ni CDATA ni rien", "web": 'https://x.fr/?a=1&b="2"'}], "trace": {}}
    racine = ET.fromstring(parcours.build_gpx(hostile))
    check("un parcours hostile parse quand même", racine.tag == f"{NS}gpx")
    wpt = racine.find(f"{NS}wpt")
    check("le nom hostile revient tel qu'écrit",
          wpt.find(f"{NS}name").text == '1. Guillemets "durs" & <b>')
    check("l'URL avec guillemets revient telle qu'écrite",
          wpt.find(f"{NS}link").get("href") == 'https://x.fr/?a=1&b="2"')


def test_parcours_sans_trace_le_dit():
    """Un parcours dont personne n'a encore calculé la géométrie sort avec ses
    repères — mais il l'annonce, au lieu de laisser croire à un chemin."""
    gpx = parcours.build_gpx({"titre": "Brouillon", "reperes": PARCOURS["reperes"], "trace": {}})
    check("pas de <trk> inventé", "<trkpt" not in gpx)
    check("l'absence de trace est écrite", "AUCUNE trace calculée" in gpx)


def test_repere_sans_coordonnees_est_saute():
    gpx = parcours.build_gpx({"titre": "T", "reperes": [
        {"nom": "sans latlng"}, {"nom": "bon", "latlng": "47.1,-2.1"},
        {"nom": "illisible", "latlng": "nawak"}], "trace": {}})
    check("seul le repère géolocalisé sort", gpx.count("<wpt ") == 1)


def test_endpoint_borne_aux_parcours():
    """L'endpoint ne doit servir QUE des `*.parcours.json` — pas n'importe quel
    JSON de la mémoire, et rien hors des magasins."""
    root = Path(WS) / "memory"
    (root / "d").mkdir(parents=True, exist_ok=True)
    (root / "d" / "x.parcours.json").write_text(json.dumps(PARCOURS), encoding="utf-8")
    (root / "d" / "secret.json").write_text('{"a":1}', encoding="utf-8")

    resp = asyncio.run(parcours.parcours_gpx(f="d/x.parcours.json"))
    check("un parcours est servi", resp.status_code == 200)
    check("il part en pièce jointe .gpx",
          'filename="x.gpx"' in resp.headers.get("content-disposition", ""))
    check("le corps est du GPX", resp.body.startswith(b"<?xml"))

    for mauvais in ("d/secret.json", "../../etc/passwd", "d/../../x.parcours.json"):
        try:
            asyncio.run(parcours.parcours_gpx(f=mauvais))
            check(f"refusé : {mauvais}", False)
        except Exception as exc:
            check(f"refusé : {mauvais}", getattr(exc, "status_code", None) == 404)


if __name__ == "__main__":
    for fn in [v for k, v in sorted(globals().items()) if k.startswith("test_")]:
        print(fn.__name__)
        fn()
    print()
    print(f"{'ÉCHECS : ' + ', '.join(FAILS) if FAILS else 'tout passe'}")
    sys.exit(1 if FAILS else 0)
