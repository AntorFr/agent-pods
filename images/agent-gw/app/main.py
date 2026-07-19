"""agent-gw — minimal chat gateway between a PWA and the Claude Agent SDK.

One channel = one persisted session (session id stored on disk, resumed on
every message). The agent identity (persona, memory discipline) comes from
the CLAUDE.md of the workspace the pod mounts — this gateway is agent-agnostic.
"""

import asyncio
import json
import os
import re
import secrets
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
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
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.middleware.sessions import SessionMiddleware

from . import auth, voyages

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
# Idle sessions are not resumed past this age (seconds; 0 disables). The
# durable state lives in memory/ (D5) — the transcript is disposable, and
# resuming a days-old conversation makes every small turn pay the whole
# accumulated context (the prompt cache TTL is ~5 min, so it is cold anyway).
SESSION_TTL = int(os.environ.get("GW_SESSION_TTL", str(4 * 3600)))
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
# Output of the sibling tunnel container (claude-pod tees it into the shared
# home) — lets the PWA surface the GitHub device-code prompt on reconnect.
TUNNEL_LOG = os.environ.get("GW_TUNNEL_LOG", str(Path.home() / ".vscode-cli" / "tunnel.out"))
# Service token gating the /mcp endpoint (other agents call Alfred over MCP).
# Machine-to-machine: coexists with Authelia, checked before the OIDC logic.
MCP_TOKEN = os.environ.get("GW_MCP_TOKEN", "")
# FastMCP validates the Host header (DNS-rebinding protection). Behind an
# ingress the Host is the public name, which must be allow-listed or every
# call 421s. Comma-separated; localhost is always added for in-pod checks.
MCP_ALLOWED_HOSTS = [
    h.strip() for h in os.environ.get("GW_MCP_ALLOWED_HOSTS", "alfred.berard.me").split(",") if h.strip()
]

STATIC_DIR = Path(__file__).parent / "static"

# MCP server exposing Alfred to other agents (Skippy, Nestor, HA…). Stateless
# HTTP: each tool call is independent; the "task" is carried by the SDK
# session id the caller passes back. Mounted at /mcp, token-guarded.
mcp_server = FastMCP(
    "alfred",
    stateless_http=True,
    json_response=True,
    streamable_http_path="/",
    transport_security=TransportSecuritySettings(
        allowed_hosts=MCP_ALLOWED_HOSTS + ["localhost", "127.0.0.1", "localhost:8000", "127.0.0.1:8000"],
        allowed_origins=[f"https://{h}" for h in MCP_ALLOWED_HOSTS],
    ),
)


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    async with mcp_server.session_manager.run():
        yield


app = FastAPI(title="agent-gw", lifespan=_lifespan)
app.include_router(auth.router)
app.include_router(voyages.router)
_query_lock = asyncio.Lock()

# Paths reachable without a session (PWA shell plumbing + auth flow itself).
# /api/confirm/consume is localhost-guarded in its handler: the agent's hook
# calls it from inside the pod, where no session cookie exists.
_PUBLIC_PATHS = ("/auth/", "/api/auth/config", "/api/confirm/consume", "/api/health", "/sw.js", "/manifest.webmanifest", "/static/")


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
        f = _session_file()
        data = json.loads(f.read_text())
        session_id = data["session_id"]
        # Ancien format sans last_used : le mtime du pointeur fait foi.
        last_used = float(data.get("last_used") or f.stat().st_mtime)
    except (OSError, KeyError, ValueError):
        return None
    if SESSION_TTL and time.time() - last_used > SESSION_TTL:
        return None  # session périmée : on repart vierge, memory/ porte l'état
    return session_id


def _save_session_id(session_id: str) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    _session_file().write_text(
        json.dumps({"session_id": session_id, "last_used": time.time()})
    )


def _transcript_file(session_id: str) -> Path:
    slug = re.sub(r"[^A-Za-z0-9]", "-", WORKSPACE)
    return Path.home() / ".claude" / "projects" / slug / f"{session_id}.jsonl"


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.middleware("http")
async def check_auth(request: Request, call_next):
    path = request.url.path
    # /mcp is machine-to-machine: gated solely by the service token, wholly
    # independent of the Authelia session (other agents have no cookie).
    if path.startswith("/mcp"):
        if MCP_TOKEN and request.headers.get("authorization") == f"Bearer {MCP_TOKEN}":
            return await call_next(request)
        return JSONResponse({"detail": "unauthorized"}, status_code=401)
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


@app.get("/api/history")
async def history(limit: int = 300):
    """Replay the persisted session transcript (written by the Claude Code
    harness) so the PWA can restore the visible conversation on reload."""
    session_id = _load_session_id()
    if not session_id:
        return {"messages": []}
    f = _transcript_file(session_id)
    if not f.is_file():
        return {"messages": []}
    out = []
    for line in f.read_text(errors="replace").splitlines():
        try:
            obj = json.loads(line)
        except ValueError:
            continue
        if obj.get("type") not in ("user", "assistant"):
            continue
        if obj.get("isMeta") or obj.get("isSidechain"):
            continue
        content = (obj.get("message") or {}).get("content")
        if isinstance(content, str):
            texts = [content]
        elif isinstance(content, list):
            texts = [
                b.get("text", "")
                for b in content
                if isinstance(b, dict) and b.get("type") == "text"
            ]
        else:
            texts = []
        text = "\n\n".join(t for t in texts if t).strip()
        # skip tool-only turns and harness-injected wrappers (<system-reminder>…)
        if not text or text.startswith("<"):
            continue
        # Artefact du harnais après un tour interrompu (mobile qui coupe la
        # connexion) — pas une parole de l'agent, jamais rejoué.
        if text == "No response requested.":
            continue
        out.append({"role": obj["type"], "text": text, "ts": obj.get("timestamp")})
    return {"messages": out[-limit:]}


@app.get("/api/session")
async def session_info():
    """Poids de la session courante, pour le compteur de la PWA. Le chiffre
    utile est le CONTEXTE du dernier appel API (input + cache) : c'est ce que
    chaque nouveau message repaiera — pas un cumul du tour, que le harnais
    gonfle d'un appel par étape d'outil."""
    session_id = _load_session_id()
    if not session_id:
        return {"active": False}
    f = _transcript_file(session_id)
    last_usage = None
    if f.is_file():
        for line in f.read_text(errors="replace").splitlines():
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            if obj.get("type") != "assistant":
                continue
            u = (obj.get("message") or {}).get("usage")
            if u:
                last_usage = u
    context = None
    if last_usage:
        context = sum(
            int(last_usage.get(k) or 0)
            for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")
        )
    return {"active": True, "context_tokens": context, "ttl": SESSION_TTL}


# Workbooks: per-project JSON emitted by the agent under the memory dir
# (…/assets/workbook.json). The front renders them; the ONLY thing the
# gateway ever writes is the sibling workbook-state.json (progress ticks,
# a user gesture — not memory, hence kept out of git by the agent).


def _workbook_file(rel: str) -> Path:
    p = _memory_path(rel)
    if p.name != "workbook.json" or not p.is_file():
        raise HTTPException(status_code=404, detail="not a workbook")
    return p


def _load_wb_state(wb: Path) -> dict:
    try:
        state = json.loads(wb.with_name("workbook-state.json").read_text())
    except (OSError, ValueError):
        state = {}
    state.setdefault("fait", {})
    return state


@app.get("/api/workbook/list")
async def workbook_list():
    root = _memory_root()
    out = []
    if root.is_dir():
        for p in sorted(root.rglob("workbook.json")):
            try:
                data = json.loads(p.read_text())
            except (OSError, ValueError):
                continue
            fait = _load_wb_state(p)["fait"]
            out.append(
                {
                    "path": str(p.relative_to(root)),
                    "projet": data.get("projet"),
                    "titre": data.get("titre") or data.get("projet") or p.parent.name,
                    "pieces": len(data.get("pieces", [])),
                    "done": len(fait),
                    "lastActivity": max(fait.values(), default=None),
                }
            )
    out.sort(key=lambda w: w["lastActivity"] or "", reverse=True)
    return {"workbooks": out}


@app.get("/api/workbook/state")
async def workbook_state(wb: str):
    return _load_wb_state(_workbook_file(wb))


@app.post("/api/workbook/state")
async def workbook_tick(request: Request):
    """One tick = one piece. Server-side merge so two devices never
    clobber each other's progress with a stale full-state write."""
    body = await request.json()
    p = _workbook_file(body.get("wb") or "")
    etiquette = (body.get("etiquette") or "").strip()
    if not etiquette:
        raise HTTPException(status_code=400, detail="etiquette required")
    state = _load_wb_state(p)
    if body.get("done", True):
        state["fait"][etiquette] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    else:
        state["fait"].pop(etiquette, None)
    p.with_name("workbook-state.json").write_text(
        json.dumps(state, ensure_ascii=False, indent=1)
    )
    return state


# One-shot confirmation for sensitive tool actions on the headless channel.
# Armed from the PWA (session-authenticated), consumed by the agent's
# PreToolUse hook via localhost. Lives in process memory on purpose: the
# agent has a shell in this container and could forge any file-based nonce,
# but it can neither read this variable nor mint a session cookie. Worst
# case it can burn a pending confirmation — deny itself, never allow.
CONFIRM_TTL = int(os.environ.get("GW_CONFIRM_TTL", "120"))
_confirm_until = 0.0


@app.get("/api/confirm")
async def confirm_state():
    remaining = max(0, int(_confirm_until - time.time()))
    return {"armed": remaining > 0, "remaining": remaining}


@app.post("/api/confirm")
async def confirm_arm():
    global _confirm_until
    _confirm_until = time.time() + CONFIRM_TTL
    return {"armed": True, "remaining": CONFIRM_TTL}


@app.post("/api/confirm/consume")
async def confirm_consume(request: Request):
    global _confirm_until
    if not request.client or request.client.host not in ("127.0.0.1", "::1"):
        raise HTTPException(status_code=403, detail="localhost only")
    granted = time.time() < _confirm_until
    _confirm_until = 0.0  # one shot, granted or not
    return {"granted": granted}


@app.get("/api/tunnel")
async def tunnel_status():
    """Parse the tunnel container's mirrored output: pending device-code
    login (for reconnecting VS Code remote) + the vscode.dev link."""
    p = Path(TUNNEL_LOG)
    if not p.is_file():
        return {"available": False}
    text = p.read_text(errors="replace")[-20000:]

    def last(pattern):
        matches = list(re.finditer(pattern, text))
        return matches[-1] if matches else None

    code = last(r"use code ([A-Z0-9]{4,}-[A-Z0-9]{4,})")
    device = last(r"https://(?:github\.com/login/device|microsoft\.com/devicelogin)\S*")
    open_url = last(r"https://vscode\.dev/tunnel/\S+")
    connected = last(r"Open this link in your browser|Connected to an existing tunnel|tunnel is up")
    # The code is only actionable if nothing indicates a completed login after it
    pending = bool(code) and (connected is None or code.start() > connected.start())
    return {
        "available": True,
        "pending": pending,
        "code": code.group(1) if code else None,
        "deviceUrl": device.group(0).rstrip(".,") if device else "https://github.com/login/device",
        "openUrl": open_url.group(0).rstrip(".,") if open_url else None,
        "updatedAt": int(p.stat().st_mtime),
        "age": int(time.time() - p.stat().st_mtime),
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


def _parse_frontmatter(text: str) -> dict:
    """Minimal reader for Alfred's flat frontmatter (type/domaine/status/cat/tags/
    title…). Handles `key: scalar`, inline `key: [a, b]`, and block `- item` lists.
    Intentionally NOT a full YAML parser — the writing contract keeps frontmatter flat."""
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end < 0:
        return {}
    fm: dict = {}
    cur = None
    for line in text[3:end].split("\n"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if m:
            key, val = m.group(1), m.group(2).strip()
            if val == "":
                fm[key] = []
                cur = key
            elif val.startswith("[") and val.endswith("]"):
                fm[key] = [v.strip().strip("\"'") for v in val[1:-1].split(",") if v.strip()]
                cur = None
            else:
                fm[key] = val.strip("\"'")
                cur = None
        elif cur is not None and re.match(r"^\s*-\s+", line):
            fm[cur].append(re.sub(r"^\s*-\s+", "", line).strip().strip("\"'"))
    return fm


@app.get("/api/memory/index")
async def memory_index():
    """Frontmatter of every memory .md in one shot — the 'dérivé' data layer that
    powers collection cards, facets and (later) search, without N round-trips."""
    root = _memory_root()
    items = []
    if root.is_dir():
        for p in sorted(root.rglob("*.md")):
            rel = p.relative_to(root)
            if any(part.startswith(".") for part in rel.parts):
                continue
            try:
                text = p.read_text(encoding="utf-8", errors="ignore")[:4000]
            except OSError:
                items.append({"path": str(rel), "fm": {}})
                continue
            fm = _parse_frontmatter(text)
            # Alfred écrit souvent le statut EN CLAIR dans le corps (`**Statut : …**`
            # / `**État : …**`), pas en frontmatter. On le récupère pour les pastilles
            # et les facettes, tronqué au 1er séparateur (—, (, ,).
            if not fm.get("status"):
                m = re.search(r"\*\*(?:Statut|État|Etat)\s*:?\s*([^*\n—(,]+)", text, re.I)
                if m:
                    fm["status"] = m.group(1).strip()
            items.append({"path": str(rel), "fm": fm})
    return {"root": MEMORY_DIR, "items": items}


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


async def _run_alfred(prompt: str, resume: str | None = None) -> tuple[str, str | None]:
    """One Alfred turn, collected (not streamed): returns (text, session_id).
    Serialized by _query_lock so MCP tasks and the PWA never run at once."""
    options = ClaudeAgentOptions(
        cwd=WORKSPACE,
        resume=resume,
        permission_mode=PERMISSION_MODE,
        system_prompt={"type": "preset", "preset": "claude_code"},
        setting_sources=["project"],
    )
    parts: list[str] = []
    session_id = resume
    async with _query_lock:
        async for msg in query(prompt=prompt, options=options):
            if isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, TextBlock) and block.text:
                        parts.append(block.text)
            elif isinstance(msg, ResultMessage):
                session_id = msg.session_id
    return "\n\n".join(parts).strip(), session_id


@mcp_server.tool(
    description=(
        "Hand a task or question to Alfred, the user's personal butler agent. "
        "Alfred manages the user's memory (todos, projects, notes, gift ideas) "
        "and calendar, and files everything with his own discipline (routing, "
        "index updates, git commit). Use it to add a todo, update a project, "
        "record a note, or ask what the user noted about something. "
        "Each call is a fresh task; to continue a clarification Alfred asked "
        "for, pass back the task_id it returned. Set 'agent' to your own name."
    )
)
async def ask_alfred(request: str, task_id: str | None = None, agent: str = "agent") -> dict:
    request = (request or "").strip()
    if not request:
        return {"error": "empty request"}
    prompt = (
        f"[Requete transmise par l'agent « {agent} » via MCP, a la demande de "
        f"Monsieur. Traite-la selon ta discipline habituelle (rangement, index, "
        f"commit), puis conclus par un compte rendu bref.]\n\n{request}"
    )
    try:
        reply, session_id = await _run_alfred(prompt, resume=task_id)
    except Exception as exc:  # returned to the caller, not swallowed
        return {"error": str(exc)}
    return {"reply": reply, "task_id": session_id}


@app.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="empty message")
    model = (body.get("model") or "").strip() or None
    if model and model not in MODEL_CHOICES:
        raise HTTPException(status_code=400, detail="unknown model")
    # Mode éphémère : parenthèse jetable à côté de la conversation principale
    # (« le RER A est perturbé ? »). Pas de resume du pointeur, pas de sauvegarde
    # — le tour ne paie pas l'historique accumulé et ne l'engraisse pas. Le
    # front peut chaîner une suite en repassant le session_id reçu dans `done`.
    ephemeral = bool(body.get("ephemeral"))
    eph_resume = (body.get("ephemeral_session") or "").strip() or None
    if eph_resume and not re.fullmatch(r"[A-Za-z0-9-]{8,64}", eph_resume):
        raise HTTPException(status_code=400, detail="bad ephemeral_session")
    if _query_lock.locked():
        raise HTTPException(status_code=409, detail="agent busy, retry later")

    # Le tour tourne dans une tâche de fond DÉCOUPLÉE de la réponse HTTP : sur
    # mobile, verrouiller l'écran tue la connexion SSE, et un générateur annulé
    # avortait le tour en plein vol — transcript laissé « ouvert », réponse
    # perdue, et à la reprise le harnais injectait « Continue from where you
    # left off. » auquel le modèle répond « No response requested. » (la bulle
    # parasite). Ici la tâche va au bout quoi qu'il arrive au client ; le
    # verrou reste tenu jusqu'à la fin du tour (un nouveau message pendant ce
    # temps → 409, que le front fait patienter).
    out: asyncio.Queue[str | None] = asyncio.Queue()

    prompt = message
    if ephemeral:
        prompt = (
            "[Mode éphémère : question ponctuelle, hors conversation courante. "
            "Réponds directement, sans rien consigner dans memory/ sauf demande "
            "explicite.]\n\n" + message
        )

    async def run_turn() -> None:
        async with _query_lock:
            options = ClaudeAgentOptions(
                cwd=WORKSPACE,
                resume=eph_resume if ephemeral else _load_session_id(),
                permission_mode=PERMISSION_MODE,
                model=model,
                # Behave like Claude Code: full system prompt + the
                # workspace CLAUDE.md (that's where the agent lives).
                system_prompt={"type": "preset", "preset": "claude_code"},
                setting_sources=["project"],
            )
            try:
                async for msg in query(prompt=prompt, options=options):
                    if isinstance(msg, AssistantMessage):
                        for block in msg.content:
                            # « No response requested. » est un artefact du
                            # harnais (réparation de tour interrompu), pas une
                            # parole d'Alfred — jamais montré.
                            if (
                                isinstance(block, TextBlock)
                                and block.text
                                and block.text.strip() != "No response requested."
                            ):
                                await out.put(_sse("text", {"text": block.text}))
                    elif isinstance(msg, ResultMessage):
                        if not ephemeral:  # la parenthèse ⚡ ne touche pas le pointeur
                            _save_session_id(msg.session_id)
                        await out.put(
                            _sse(
                                "done",
                                {
                                    "session_id": msg.session_id,
                                    "duration_ms": msg.duration_ms,
                                    "ephemeral": ephemeral,
                                },
                            )
                        )
            except Exception as exc:  # surfaced to the client, not swallowed
                await out.put(_sse("error", {"message": str(exc)}))
            finally:
                await out.put(None)

    asyncio.create_task(run_turn())

    async def stream():
        # Simple lecteur de la file ; si le client décroche, ce générateur meurt
        # mais run_turn continue seule jusqu'au bout du tour.
        while True:
            item = await out.get()
            if item is None:
                break
            yield item

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@app.get("/")
@app.get("/app")
async def index():
    # La nouvelle UI (launcher) EST l'app depuis la bascule du 2026-07-18.
    # /app reste un alias (liens/onglets de la période de migration).
    # no-cache : le navigateur doit revalider le shell à chaque chargement,
    # sinon il sert un frontend périmé après un déploiement.
    return FileResponse(
        STATIC_DIR / "app.html",
        headers={"Cache-Control": "no-cache, must-revalidate"},
    )


@app.get("/legacy")
async def legacy():
    # L'ancienne UI (arbre + 3 colonnes), gardée en filet de sécurité le temps
    # de roder la nouvelle. À retirer avec app/static/index.html quand plus personne
    # ne s'en sert.
    return FileResponse(
        STATIC_DIR / "index.html",
        headers={"Cache-Control": "no-cache, must-revalidate"},
    )


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
# MCP endpoint for other agents (token-guarded in check_auth above).
app.mount("/mcp", mcp_server.streamable_http_app())
