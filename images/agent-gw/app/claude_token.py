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
import os
import re
import shutil
import struct
import termios
import uuid
from pathlib import Path

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
        os.write(self._master, code.encode() + b"\n")
        try:
            await asyncio.wait_for(self._exit_event.wait(), EXCHANGE_TIMEOUT)
        except asyncio.TimeoutError:
            # Sur code invalide le CLI re-prompte sans sortir : on retombe ici.
            self._fail("L'échange n'a pas abouti — code invalide ou expiré ?")

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
