"""agent-gw — minimal chat gateway between a PWA and the Claude Agent SDK.

One channel = one persisted session (session id stored on disk, resumed on
every message). The agent identity (persona, memory discipline) comes from
the CLAUDE.md of the workspace the pod mounts — this gateway is agent-agnostic.
"""

import asyncio
import json
import os
from pathlib import Path

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    TextBlock,
    query,
)
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

WORKSPACE = os.environ.get("GW_WORKSPACE", "/workspace")
CHANNEL = os.environ.get("GW_CHANNEL", "pwa")
STATE_DIR = Path(os.environ.get("GW_STATE_DIR", str(Path.home() / ".agent-gw")))
# Optional bearer token (defense in depth behind the SSO/VPN layer).
AUTH_TOKEN = os.environ.get("GW_AUTH_TOKEN", "")
# Headless gateway: nobody can answer a permission prompt, so tools run
# unattended. The pod's isolation (dedicated container, mounted volumes)
# is the actual boundary.
PERMISSION_MODE = os.environ.get("GW_PERMISSION_MODE", "bypassPermissions")

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="agent-gw")
_query_lock = asyncio.Lock()


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
    if AUTH_TOKEN and request.url.path.startswith("/api/"):
        auth = request.headers.get("authorization", "")
        if auth != f"Bearer {AUTH_TOKEN}":
            from fastapi.responses import JSONResponse

            return JSONResponse({"detail": "unauthorized"}, status_code=401)
    return await call_next(request)


@app.get("/api/health")
async def health():
    return {"status": "ok", "channel": CHANNEL, "busy": _query_lock.locked()}


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
    if _query_lock.locked():
        raise HTTPException(status_code=409, detail="agent busy, retry later")

    async def stream():
        async with _query_lock:
            options = ClaudeAgentOptions(
                cwd=WORKSPACE,
                resume=_load_session_id(),
                permission_mode=PERMISSION_MODE,
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
