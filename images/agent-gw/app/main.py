"""agent-gw — minimal chat gateway between a PWA and the Claude Agent SDK.

One channel = one persisted session (session id stored on disk, resumed on
every message). The agent identity (persona, memory discipline) comes from
the CLAUDE.md of the workspace the pod mounts — this gateway is agent-agnostic.
"""

import asyncio
import json
import os
import secrets
from pathlib import Path

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    TextBlock,
    query,
)
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from . import auth

WORKSPACE = os.environ.get("GW_WORKSPACE", "/workspace")
CHANNEL = os.environ.get("GW_CHANNEL", "pwa")
STATE_DIR = Path(os.environ.get("GW_STATE_DIR", str(Path.home() / ".agent-gw")))
# Fallback bearer token, only used when OIDC is not configured (dev mode).
AUTH_TOKEN = os.environ.get("GW_AUTH_TOKEN", "")
# Signs the session cookie. Pin it in deployment values (DR-via-git policy);
# the random fallback just means sessions reset on restart in dev.
SESSION_SECRET = os.environ.get("GW_SESSION_SECRET") or secrets.token_hex(32)
# Headless gateway: nobody can answer a permission prompt, so tools run
# unattended. The pod's isolation (dedicated container, mounted volumes)
# is the actual boundary.
PERMISSION_MODE = os.environ.get("GW_PERMISSION_MODE", "bypassPermissions")
# Models offered in the PWA dropdown, as "Label:model" pairs. CLI aliases
# (opus, sonnet, haiku) always resolve to the latest model of the family,
# so the list stays current without a rebuild. "Auto" (no model sent) is
# always prepended: the SDK then uses its own default.
MODELS = os.environ.get(
    "GW_MODELS",
    "Fable:claude-fable-5,Opus:opus,Sonnet:sonnet,Haiku:haiku",
)
MODEL_CHOICES: dict[str, str] = {}  # model id -> label
for _pair in MODELS.split(","):
    _label, _, _model = _pair.partition(":")
    if _label.strip() and _model.strip():
        MODEL_CHOICES[_model.strip()] = _label.strip()
# Read-only browsing of the agent's memory (markdown + attachments), shown
# by the PWA on large screens. Relative to the workspace.
MEMORY_DIR = os.environ.get("GW_MEMORY_DIR", "memory")
# Todo file surfaced as a dedicated view, relative to the memory dir.
TODO_FILE = os.environ.get("GW_TODO_FILE", "todo/taches.md")

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="agent-gw")
app.include_router(auth.router)
_query_lock = asyncio.Lock()

# Paths reachable without a session (PWA shell plumbing + auth flow itself)
_PUBLIC_PATHS = ("/auth/", "/api/auth/config", "/api/health", "/sw.js", "/manifest.webmanifest", "/static/")


def _is_authenticated(request: Request) -> bool:
    if auth.oidc_enabled:
        return bool(request.session.get("user"))
    if AUTH_TOKEN:
        return request.headers.get("authorization") == f"Bearer {AUTH_TOKEN}"
    return True  # nothing configured: open (dev only — do not deploy like this)


def _session_file() -> Path:
    return STATE_DIR / f"session-{CHANNEL}.json"


def _load_session_id() -> str | None:
    try:
        return json.loads(_session_file().read_text())["session_id"]
    except (OSError, KeyError, ValueError):
        return None


def _save_session_id(session_id: str) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    _session_file().write_text(json.dumps({"session_id": session_id}))


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.middleware("http")
async def check_auth(request: Request, call_next):
    path = request.url.path
    if not path.startswith(_PUBLIC_PATHS) and not _is_authenticated(request):
        if path.startswith("/api/"):
            return JSONResponse({"detail": "unauthorized"}, status_code=401)
        if auth.oidc_enabled:
            return RedirectResponse("/auth/login")
        return JSONResponse({"detail": "unauthorized"}, status_code=401)
    return await call_next(request)


# Added AFTER check_auth on purpose: Starlette runs the last-added middleware
# first, and the session must exist before check_auth reads it.
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    max_age=30 * 24 * 3600,  # PWA-friendly: one Authelia login a month
    https_only=True,
    same_site="lax",
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "channel": CHANNEL, "busy": _query_lock.locked()}


@app.get("/api/models")
async def models():
    return {
        "models": [{"id": m, "label": l} for m, l in MODEL_CHOICES.items()],
    }


def _memory_root() -> Path:
    return (Path(WORKSPACE) / MEMORY_DIR).resolve()


def _memory_path(rel: str) -> Path:
    root = _memory_root()
    p = (root / rel).resolve()
    if p != root and root not in p.parents:
        raise HTTPException(status_code=400, detail="invalid path")
    return p


@app.get("/api/memory/tree")
async def memory_tree():
    """Flat listing of the memory dir (the client builds the tree)."""
    root = _memory_root()
    entries = []
    if root.is_dir():
        for p in sorted(root.rglob("*")):
            rel = p.relative_to(root)
            if any(part.startswith(".") for part in rel.parts):
                continue
            entries.append(
                {
                    "path": str(rel),
                    "dir": p.is_dir(),
                    "size": p.stat().st_size if p.is_file() else None,
                }
            )
    return {"root": MEMORY_DIR, "todo": TODO_FILE, "entries": entries}


@app.get("/api/memory/raw/{rel_path:path}")
async def memory_raw(rel_path: str, download: bool = False):
    """Serve one memory file: markdown/images inline, anything else is
    downloadable (?download=1 forces an attachment disposition)."""
    p = _memory_path(rel_path)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="not found")
    headers = {"Cache-Control": "no-store"}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{p.name}"'
    return FileResponse(p, headers=headers)


@app.post("/api/reset")
async def reset():
    _session_file().unlink(missing_ok=True)
    return {"status": "reset"}


@app.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="empty message")
    model = (body.get("model") or "").strip() or None
    if model and model not in MODEL_CHOICES:
        raise HTTPException(status_code=400, detail="unknown model")
    if _query_lock.locked():
        raise HTTPException(status_code=409, detail="agent busy, retry later")

    async def stream():
        async with _query_lock:
            options = ClaudeAgentOptions(
                cwd=WORKSPACE,
                resume=_load_session_id(),
                permission_mode=PERMISSION_MODE,
                model=model,
                # Behave like Claude Code: full system prompt + the
                # workspace CLAUDE.md (that's where the agent lives).
                system_prompt={"type": "preset", "preset": "claude_code"},
                setting_sources=["project"],
            )
            try:
                async for msg in query(prompt=message, options=options):
                    if isinstance(msg, AssistantMessage):
                        for block in msg.content:
                            if isinstance(block, TextBlock) and block.text:
                                yield _sse("text", {"text": block.text})
                    elif isinstance(msg, ResultMessage):
                        _save_session_id(msg.session_id)
                        yield _sse(
                            "done",
                            {
                                "session_id": msg.session_id,
                                "duration_ms": msg.duration_ms,
                            },
                        )
            except Exception as exc:  # surfaced to the client, not swallowed
                yield _sse("error", {"message": str(exc)})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


# Served from the root so the service worker scope covers the whole app.
@app.get("/sw.js")
async def service_worker():
    return FileResponse(STATIC_DIR / "sw.js", media_type="text/javascript")


@app.get("/manifest.webmanifest")
async def manifest():
    return FileResponse(
        STATIC_DIR / "manifest.webmanifest", media_type="application/manifest+json"
    )


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
