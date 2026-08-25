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


"""Quotas d'usage (/usage) : on rejoue le guichet d'Anthropic avec un faux
httpx — testés : le cas sans token, les en-têtes requis, le cache TTL, le
service du dernier relevé sur 429, et le 401 (token périmé)."""


class _FakeResp:
    def __init__(self, status, data=None):
        self.status_code = status
        self._data = data

    def json(self):
        if self._data is None:
            raise ValueError("pas de JSON")
        return self._data


class _FakeClient:
    plan = []
    calls = 0
    last_headers = None

    def __init__(self, timeout=None):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, headers=None):
        _FakeClient.calls += 1
        _FakeClient.last_headers = headers
        item = _FakeClient.plan.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def _expire_cache():
    ct._usage_cache["at"] = -1e9


async def usage_flows():
    import types

    real_httpx = ct.httpx
    ct.httpx = types.SimpleNamespace(AsyncClient=_FakeClient, HTTPError=real_httpx.HTTPError)
    ct._cli_version = "9.9.9"  # court-circuite `claude --version` (faux binaire inadapté)

    # Sans token (ni fichier géré, ni credentials.json dans le home du test).
    ct.TOKEN_FILE.unlink(missing_ok=True)
    home_creds = Path.home() / ".claude" / ".credentials.json"
    res = await ct.usage()
    check("usage sans token → indisponible", res["available"] is False or home_creds.exists())

    # Nominal : réponse du guichet relayée, en-têtes corrects.
    ct._save_token("sk-ant-oat01-FAKETOKEN0123456789abcdefghijklmnop")
    windows = {
        "five_hour": {"utilization": 33.0, "resets_at": "2026-08-17T18:00:00+00:00"},
        "seven_day": {"utilization": 13.0, "resets_at": "2026-08-21T00:59:59+00:00"},
        "seven_day_opus": None,
    }
    _FakeClient.plan = [_FakeResp(200, windows)]
    _FakeClient.calls = 0
    res = await ct.usage()
    check("usage nominal → disponible", res["available"] is True and res["stale"] is False)
    check("fenêtres relayées telles quelles", res["usage"] == windows)
    check(
        "en-têtes requis (beta + User-Agent claude-code/…)",
        _FakeClient.last_headers["anthropic-beta"] == "oauth-2025-04-20"
        and _FakeClient.last_headers["User-Agent"] == "claude-code/9.9.9"
        and _FakeClient.last_headers["Authorization"].startswith("Bearer sk-ant-oat01-"),
    )

    # Cache TTL : un second appel ne resollicite pas l'amont (il rate-limite).
    await ct.usage()
    check("cache TTL — un seul appel amont", _FakeClient.calls == 1)

    # 429 après expiration du cache : on sert le dernier relevé, marqué stale.
    _expire_cache()
    _FakeClient.plan = [_FakeResp(429)]
    res = await ct.usage()
    check("429 → dernier relevé servi, marqué stale", res["available"] is True and res["stale"] is True)

    # 401 : token périmé/révoqué — pas de relevé, un motif clair.
    _expire_cache()
    _FakeClient.plan = [_FakeResp(401)]
    res = await ct.usage()
    check("401 → indisponible avec motif", res["available"] is False and "token" in res["reason"].lower())

    # 403 de portée : mur définitif, pas un aléa d'amont. Le cache porte encore le
    # relevé nominal — le servir marqué « stale » masquerait le mur, ce qui a fait
    # passer la panne du 2026-08-25 pour un réseau capricieux pendant des jours.
    _expire_cache()
    _FakeClient.plan = [
        _FakeResp(
            403,
            {
                "type": "error",
                "error": {
                    "type": "permission_error",
                    "message": "OAuth token does not meet scope requirement user:profile",
                },
            },
        )
    ]
    res = await ct.usage()
    check("403 de portée → indisponible malgré le relevé en cache", res["available"] is False)
    check("403 de portée → motif explicite", "inférence" in res["reason"])
    check("403 de portée → message de l'amont conservé", "user:profile" in res.get("upstream", ""))

    # Autre non-200 : on relaie le motif écrit par l'amont, pas un chiffre nu.
    ct._usage_cache.update(token=None, at=-1e9, payload=None)
    _FakeClient.plan = [_FakeResp(503, {"error": {"message": "upstream is having a moment"}})]
    res = await ct.usage()
    check("non-200 → motif de l'amont relayé", "upstream is having a moment" in res.get("reason", ""))

    # Corps illisible : on dégrade sur le code seul, sans exploser.
    ct._usage_cache.update(token=None, at=-1e9, payload=None)
    _FakeClient.plan = [_FakeResp(500)]
    res = await ct.usage()
    check("non-200 sans corps JSON → motif au code seul", "500" in res.get("reason", ""))

    ct.httpx = real_httpx


async def main():
    await flow_ok()
    await flow_bad_code()
    await usage_flows()


asyncio.run(main())

if FAILS:
    print(f"\n{len(FAILS)} échec(s)")
    sys.exit(1)
print("\nCLAUDE TOKEN OK")
