"""Connexion de l'abonnement Claude depuis la PWA — pilote `claude setup-token`.

Le TUI (Ink) du CLI exige un pseudo-terminal : sans tty il n'émet RIEN (vérifié
en conteneur, 2026-08-06). On lui ouvre donc un pty assez large (500 colonnes,
sinon l'URL d'autorisation se replie sur plusieurs lignes) et on rejoue le flux
interactif : start → URL à ouvrir dans un navigateur → l'humain autorise et
colle le code → le CLI échange et sort.

Le token est capté à l'écran (filet : le fichier de credentials que le CLI
écrit sous ~/.claude, home partagé avec claude-pod) puis gardé dans STATE_DIR.
Chaque tour d'agent l'injecte en CLAUDE_CODE_OAUTH_TOKEN — prioritaire, dans
la chaîne d'auth du CLI, sur des credentials périmés du home partagé.
"""

import asyncio
import fcntl
import json
import os
import re
import shutil
import struct
import termios
import time
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/claude-token")

STATE_DIR = Path(os.environ.get("GW_STATE_DIR", str(Path.home() / ".agent-gw")))
TOKEN_FILE = STATE_DIR / "claude-oauth-token"

_TOKEN_RE = re.compile(r"sk-ant-oat01-[A-Za-z0-9_-]{20,}")
_ANSI_RE = re.compile("\x1b\\[[0-9;?]*[a-zA-Z]|\x1b\\][^\x07]*\x07|\x1b[=>]")
_URL_RE = re.compile(r"https://[^\s\"'<>]+oauth[^\s\"'<>]*", re.I)
_PROMPT_RE = re.compile(r"Paste\s*code\s*here", re.I)

SESSION_TTL = 600.0
URL_TIMEOUT = 30.0
EXCHANGE_TIMEOUT = 60.0


def stored_token() -> str | None:
    try:
        return TOKEN_FILE.read_text().strip() or None
    except OSError:
        return None


def stored_env() -> dict[str, str]:
    """Env à merger sous celui de l'appelant dans chaque tour d'agent."""
    token = stored_token()
    return {"CLAUDE_CODE_OAUTH_TOKEN": token} if token else {}


def _save_token(token: str) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(token + "\n")
    TOKEN_FILE.chmod(0o600)


def _claude_bin() -> str:
    """CLAUDE_BIN explicite (tests, chemins exotiques) sinon le PATH."""
    explicit = os.environ.get("CLAUDE_BIN")
    if explicit:
        return explicit
    found = shutil.which("claude")
    if not found:
        raise HTTPException(503, "CLI claude introuvable dans cette image.")
    return found


class _Session:
    def __init__(self) -> None:
        self.id = uuid.uuid4().hex
        self.state = "starting"  # starting|awaiting-code|exchanging|done|error
        self.authorize_url: str | None = None
        self.error: str | None = None
        self._buffer = ""
        self._master: int | None = None
        self._proc: asyncio.subprocess.Process | None = None
        self._url_event = asyncio.Event()
        self._exit_event = asyncio.Event()

    async def start(self) -> None:
        bin_path = _claude_bin()
        master, slave = os.openpty()
        self._master = master
        # 500 colonnes : l'URL tient sur une ligne, le parsing reste trivial.
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 500, 0, 0))

        env = dict(os.environ)
        env["TERM"] = "xterm-256color"
        # Pas de navigateur dans le pod : le CLI affiche alors l'URL en clair.
        env["BROWSER"] = "/bin/false"

        self._proc = await asyncio.create_subprocess_exec(
            bin_path,
            "setup-token",
            stdin=slave,
            stdout=slave,
            stderr=slave,
            env=env,
            start_new_session=True,
        )
        os.close(slave)
        asyncio.create_task(self._read_loop())
        asyncio.create_task(self._watch_exit())
        asyncio.create_task(self._ttl())

        try:
            await asyncio.wait_for(self._url_event.wait(), URL_TIMEOUT)
        except asyncio.TimeoutError:
            self._fail("L'URL d'autorisation n'est pas apparue à temps.")

    async def submit(self, code: str) -> None:
        if self.state != "awaiting-code" or self._master is None:
            raise HTTPException(409, f"Session pas prête pour un code ({self.state}).")
        self.state = "exchanging"
        # Deux subtilités du TUI, chacune vécue en prod sur l'Antre :
        # 1. la touche Entrée d'un pty brut est \r, pas \n ;
        # 2. un \r collé DANS le même flot que le code est avalé par la garde
        #    anti-collage — il faut l'envoyer séparément, après une pause (un
        #    code court y échappe, d'où un test au faux binaire trompeur).
        os.write(self._master, code.encode())
        await asyncio.sleep(0.5)
        os.write(self._master, b"\r")
        asyncio.get_running_loop().call_later(6.0, self._retry_enter)
        try:
            await asyncio.wait_for(self._exit_event.wait(), EXCHANGE_TIMEOUT)
        except asyncio.TimeoutError:
            # Sur code invalide le CLI re-prompte sans sortir : on retombe ici.
            self._fail("L'échange n'a pas abouti — code invalide ou expiré ?")

    def _retry_enter(self) -> None:
        """Filet : certains écrans redemandent une validation."""
        if self.state == "exchanging" and self._master is not None:
            try:
                os.write(self._master, b"\r")
            except OSError:
                pass

    def dispose(self) -> None:
        if self._proc and self._proc.returncode is None:
            self._proc.kill()

    async def _read_loop(self) -> None:
        loop = asyncio.get_running_loop()
        master = self._master
        assert master is not None
        while True:
            try:
                chunk = await loop.run_in_executor(None, os.read, master, 4096)
            except OSError:
                break
            if not chunk:
                break
            self._feed(chunk.decode("utf-8", errors="replace"))
        os.close(master)

    def _feed(self, text: str) -> None:
        self._buffer += text
        clean = _ANSI_RE.sub("", self._buffer)
        if not self.authorize_url:
            match = _URL_RE.search(clean)
            if match:
                self.authorize_url = match.group(0)
                self._url_event.set()
        if self.state == "starting" and _PROMPT_RE.search(clean):
            self.state = "awaiting-code"

    async def _watch_exit(self) -> None:
        assert self._proc is not None
        await self._proc.wait()
        if self.state in ("done", "error"):
            self._exit_event.set()
            return

        token = None
        match = _TOKEN_RE.search(_ANSI_RE.sub("", self._buffer))
        if match:
            token = match.group(0)
        if not token:
            # Filet : le CLI écrit ses credentials dans le home (partagé).
            try:
                creds = (Path.home() / ".claude" / ".credentials.json").read_text()
                found = _TOKEN_RE.search(creds)
                token = found.group(0) if found else None
            except OSError:
                pass

        if token:
            _save_token(token)
            self.state = "done"
        else:
            was_exchanging = self.state == "exchanging"
            self.state = "error"
            self.error = (
                "Le CLI s'est terminé sans produire de token — code invalide ?"
                if was_exchanging
                else "Le CLI s'est terminé prématurément."
            )
        self._exit_event.set()

    async def _ttl(self) -> None:
        await asyncio.sleep(SESSION_TTL)
        if self.state not in ("done", "error"):
            self._fail("Session expirée (10 min), relance la connexion.")

    def _fail(self, message: str) -> None:
        if self.state in ("done", "error"):
            return
        self.state = "error"
        self.error = message
        self._url_event.set()
        self._exit_event.set()
        self.dispose()


_active: _Session | None = None


def _status() -> dict:
    token = stored_token()
    saved_at = None
    if token:
        try:
            saved_at = int(TOKEN_FILE.stat().st_mtime)
        except OSError:
            pass
    return {"tokenPresent": bool(token), "savedAt": saved_at}


@router.get("/status")
async def status():
    return _status()


@router.post("/start")
async def start():
    global _active
    if _active:
        _active.dispose()
    _active = _Session()
    await _active.start()
    if _active.state == "error" or not _active.authorize_url:
        raise HTTPException(502, _active.error or "Démarrage impossible.")
    return {"sessionId": _active.id, "authorizeUrl": _active.authorize_url}


# ── Quotas d'usage de l'abonnement ───────────────────────────────────────────
# Le même guichet que le `/usage` du CLI : fenêtres serveur (session 5 h,
# plafonds hebdomadaires) avec pourcentage consommé et heure de remise à zéro.
# Endpoint non documenté mais stable, utilisé par tout l'outillage communautaire.

USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
# L'amont rate-limite sévèrement (anthropics/claude-code#31637) : on ne le
# sollicite jamais plus d'une fois par fenêtre de 3 min, modale ouverte ou pas.
USAGE_TTL = 180.0

_usage_cache: dict = {"token": None, "at": 0.0, "payload": None}
_cli_version: str | None = None


def _usage_token() -> str | None:
    """Le token géré ici, sinon les credentials `claude login` du home partagé."""
    token = stored_token()
    if token:
        return token
    try:
        creds = json.loads((Path.home() / ".claude" / ".credentials.json").read_text())
        return (creds.get("claudeAiOauth") or {}).get("accessToken") or None
    except (OSError, ValueError):
        return None


async def _ua_version() -> str:
    """Version du CLI pour le User-Agent — sans `claude-code/x.y.z`, l'amont
    répond des 429 persistants (bucket anonyme). Résolue une fois par process."""
    global _cli_version
    if _cli_version:
        return _cli_version
    try:
        proc = await asyncio.create_subprocess_exec(
            _claude_bin(),
            "--version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            stdin=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), 10)
        match = re.search(r"\d+\.\d+\.\d+\S*", out.decode("utf-8", errors="replace"))
        _cli_version = match.group(0) if match else "2.0.0"
    except (OSError, HTTPException, asyncio.TimeoutError):
        _cli_version = "2.0.0"
    return _cli_version


def _usage_stale_or(reason: str, token: str) -> dict:
    """Amont injoignable : mieux vaut le dernier relevé, marqué `stale`, que rien."""
    cache = _usage_cache
    if cache["payload"] and cache["token"] == token:
        return {**cache["payload"], "stale": True}
    return {"available": False, "reason": reason}


@router.get("/usage")
async def usage():
    token = _usage_token()
    if not token:
        return {
            "available": False,
            "reason": "Aucun token d'abonnement connu du corps — passe d'abord par « Connexion Claude ».",
        }
    cache = _usage_cache
    if cache["payload"] and cache["token"] == token and time.monotonic() - cache["at"] < USAGE_TTL:
        return cache["payload"]
    headers = {
        "Authorization": f"Bearer {token}",
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": f"claude-code/{await _ua_version()}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(USAGE_URL, headers=headers)
    except httpx.HTTPError as exc:
        return _usage_stale_or(f"Anthropic injoignable ({exc.__class__.__name__}).", token)
    if resp.status_code == 401:
        return {
            "available": False,
            "reason": "Token refusé par Anthropic (périmé ou révoqué) — renouvelle la connexion Claude.",
        }
    if resp.status_code == 429:
        return _usage_stale_or("Le guichet d'usage d'Anthropic rate-limite — réessaie dans quelques minutes.", token)
    if resp.status_code != 200:
        return _usage_stale_or(f"Réponse {resp.status_code} du guichet d'usage d'Anthropic.", token)
    try:
        data = resp.json()
    except ValueError:
        return _usage_stale_or("Réponse illisible du guichet d'usage d'Anthropic.", token)
    payload = {"available": True, "stale": False, "fetchedAt": int(time.time()), "usage": data}
    _usage_cache.update(token=token, at=time.monotonic(), payload=payload)
    return payload


@router.post("/code")
async def code(request: Request):
    payload = await request.json()
    session_id = str(payload.get("sessionId") or "")
    auth_code = str(payload.get("code") or "").strip()
    if not auth_code or len(auth_code) < 8:
        raise HTTPException(400, "Code manquant ou trop court.")
    if not _active or _active.id != session_id:
        raise HTTPException(404, "Session inconnue ou expirée — relance la connexion.")
    await _active.submit(auth_code)
    if _active.state != "done":
        raise HTTPException(502, _active.error or "L'échange du code a échoué.")
    return _status()
