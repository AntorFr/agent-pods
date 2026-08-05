"""Tests de la connexion abonnement Claude (app/claude_token.py).

Le vrai `claude setup-token` exige un compte et un navigateur : on le remplace
par un FAUX binaire qui rejoue exactement sa partition observée en conteneur
(URL d'autorisation, invite « Paste code here », token en sortie). Ce qui est
testé est donc NOTRE plomberie : le pty, le parsing ANSI, la détection d'URL,
l'acheminement du code collé, la capture et le stockage du token.
Lancer depuis images/agent-gw :
    python test/claude_token_test.py
"""

import asyncio
import os
import stat
import sys
import tempfile
from pathlib import Path

STATE = Path(tempfile.mkdtemp())
os.environ["GW_STATE_DIR"] = str(STATE)

FAKE_BIN = STATE / "fake-claude"
FAKE_BIN.write_text(
    "#!/bin/bash\n"
    "echo 'Welcome to Claude Code'\n"
    "echo 'Opening browser to sign in…'\n"
    "echo \"Browser didn't open? Use the url below to sign in\"\n"
    "echo 'https://claude.com/cai/oauth/authorize?code=true&client_id=fake&state=abc'\n"
    "echo 'Paste code here if prompted >'\n"
    "read CODE\n"
    "if [ \"$CODE\" = 'bad-code-1234' ]; then\n"
    "  echo 'Invalid code'\n"
    "  exit 1\n"
    "fi\n"
    "echo 'Success! Your token:'\n"
    "echo 'sk-ant-oat01-FAKETOKEN0123456789abcdefghijklmnop'\n"
)
FAKE_BIN.chmod(FAKE_BIN.stat().st_mode | stat.S_IEXEC)
os.environ["CLAUDE_BIN"] = str(FAKE_BIN)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.claude_token as ct  # noqa: E402

FAILS = []


def check(name, cond):
    print(("  ok  " if cond else "  FAIL") + "  " + name)
    if not cond:
        FAILS.append(name)


async def flow_ok():
    session = ct._Session()
    await session.start()
    check("URL d'autorisation détectée", bool(session.authorize_url))
    check(
        "URL complète (pas repliée)",
        session.authorize_url == "https://claude.com/cai/oauth/authorize?code=true&client_id=fake&state=abc",
    )
    # L'invite peut arriver dans le même paquet que l'URL ou juste après.
    for _ in range(50):
        if session.state == "awaiting-code":
            break
        await asyncio.sleep(0.1)
    check("invite de code détectée", session.state == "awaiting-code")
    await session.submit("real-looking-code#state")
    check("échange abouti", session.state == "done")
    check("token stocké", ct.stored_token() == "sk-ant-oat01-FAKETOKEN0123456789abcdefghijklmnop")
    check("fichier en 600", (ct.TOKEN_FILE.stat().st_mode & 0o777) == 0o600)
    check(
        "env injecté",
        ct.stored_env() == {"CLAUDE_CODE_OAUTH_TOKEN": "sk-ant-oat01-FAKETOKEN0123456789abcdefghijklmnop"},
    )


async def flow_bad_code():
    ct.TOKEN_FILE.unlink(missing_ok=True)
    session = ct._Session()
    await session.start()
    for _ in range(50):
        if session.state == "awaiting-code":
            break
        await asyncio.sleep(0.1)
    await session.submit("bad-code-1234")
    check("code refusé → erreur", session.state == "error")
    check("pas de token stocké sur échec", ct.stored_token() is None)


async def main():
    await flow_ok()
    await flow_bad_code()


asyncio.run(main())

if FAILS:
    print(f"\n{len(FAILS)} échec(s)")
    sys.exit(1)
print("\nCLAUDE TOKEN OK")
