"""Tests de l'arrêt d'un tour en cours (POST /api/chat/stop).

Le point dur n'est pas l'endpoint, c'est ce qu'il NE fait pas : il ne prend pas
`_query_lock` (l'attendre serait attendre la fin du tour qu'on interrompt) et il
n'annule pas la tâche (ça rejouerait la panne du transcript laissé ouvert). Il
envoie le signal d'arrêt du CLI, et rien d'autre. Sans réseau ni SDK réel.
Lancer depuis images/agent-gw :
    python test/stop_test.py
"""

import asyncio
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


class FauxClient:
    """Le strict minimum de ClaudeSDKClient dont l'endpoint a besoin."""

    def __init__(self):
        self.interruptions = 0

    async def interrupt(self):
        self.interruptions += 1


def reset():
    main._current_client = None
    main._stop_asked = False


print("\n--- aucun tour en cours ---")

reset()
r = asyncio.run(main.chat_stop())
check("répond `idle` au lieu d'échouer", r == {"status": "idle"})
check("ne lève pas le drapeau pour rien", main._stop_asked is False)

print("\n--- un tour en cours ---")

reset()
c = FauxClient()
main._turn_started(c)
check("_turn_started enregistre le client", main._current_client is c)
check("_turn_started repart d'un drapeau baissé", main._stop_asked is False)

r = asyncio.run(main.chat_stop())
check("répond `interrupting`", r == {"status": "interrupting"})
check("a bien envoyé le signal, une fois", c.interruptions == 1)
check("le drapeau est levé pour le `done`", main._stop_asked is True)

print("\n--- deuxième clic : idempotent tant que le tour vit ---")

r = asyncio.run(main.chat_stop())
check("répond encore `interrupting`", r == {"status": "interrupting"})
check("le signal est renvoyé, pas avalé", c.interruptions == 2)

print("\n--- le verrou n'est JAMAIS pris ---")
# Un tour en cours tient `_query_lock`. Si l'endpoint l'attendait, il ne
# rendrait la main qu'à la fin du tour — exactement ce qu'on veut interrompre.


async def sous_verrou():
    async with main._query_lock:
        main._turn_started(c)
        return await asyncio.wait_for(main.chat_stop(), timeout=2)


r = asyncio.run(sous_verrou())
check("répond alors que le verrou est tenu", r == {"status": "interrupting"})

print("\n--- fin de tour : le registre se vide ---")

main._turn_ended()
check("_turn_ended libère l'emplacement", main._current_client is None)
r = asyncio.run(main.chat_stop())
check("un stop après coup retombe sur `idle`", r == {"status": "idle"})

print("\n--- le drapeau se rabaisse au tour SUIVANT ---")
# Sinon un `done` normal se présenterait comme un tour arrêté.

main._turn_started(FauxClient())
check("_turn_started rabaisse `_stop_asked`", main._stop_asked is False)
main._turn_ended()

print()
if FAILS:
    print("ÉCHECS : " + ", ".join(FAILS))
    sys.exit(1)
print("STOP OK")
