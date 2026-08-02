# agent-pods

Container images for always-on AI agent pods running on Kubernetes — bodies
for [Claude Code](https://code.claude.com/) based assistants. The images are
agent-agnostic: the agent's identity (persona, memory, instructions) comes
from the workspace you mount, not from the image.

## Images

| Image | Purpose |
|---|---|
| [`claude-pod`](images/claude-pod/) | Agent body: VS Code tunnel (outbound-only) + Claude Code CLI + git/ripgrep. No inbound port. |
| [`agent-gw`](images/agent-gw/) | Mobile chat gateway: FastAPI + PWA frontend, driving the Claude Agent SDK with one persisted session per channel. |
| [`alfred-voice`](images/alfred-voice/) | Voice satellite server: drives ESPHome `voice_assistant` devices over the native API (in HA's place), Wyoming STT/TTS, wake-word routing to the agent gateway (async ack + announce) or Home Assistant. |

Published to GHCR: `ghcr.io/antorfr/<image>`.

## Tagging contract (monorepo)

One repository, several independently versioned images:

```
git tag <image>-vX.Y.Z   →  ghcr.io/antorfr/<image>:X.Y.Z (+ :X.Y :X)
push on main             →  ghcr.io/antorfr/<image>:main (all images)
pull request             →  build only, no push
```

Multi-arch (`amd64` + `arm64`) on stable release tags; everything else builds
`amd64` only.

## claude-pod

Runs `code tunnel` as its entrypoint — the pod is reachable through
vscode.dev / VS Code desktop with **zero inbound ports**. First start prints a
device-code login URL in the pod logs; the token persists in `~/.vscode-cli`.

State that must survive restarts (mount as volumes):

| Path | Contents |
|---|---|
| `/home/agent/.claude` | Claude Code sessions + subscription credentials |
| `/home/agent/.vscode-cli` | VS Code tunnel auth token |
| `/workspace` | the agent's working repo |

Environment: `TUNNEL_NAME` (max 20 chars), `GIT_USER_NAME` / `GIT_USER_EMAIL`
(seeded once into the persisted home), `TUNNEL_LOG` (default
`~/.vscode-cli/tunnel.out`) — the tunnel output is mirrored there so a
sidecar gateway sharing the home can surface the device-code prompt.

## agent-gw

HTTP server (port 8000) serving a chat PWA (markdown rendering via vendored
[marked](https://github.com/markedjs/marked) + [DOMPurify](https://github.com/cure53/DOMPurify),
typing indicator, model picker) and an SSE API:

- `POST /api/chat` — send a message (`{message, model?, vue?}`), stream the agent's reply (SSE)
- `POST /api/reset` — start a fresh session for the channel
- `GET /api/models` — models offered in the PWA dropdown
- `GET /api/version` — the running build (`GW_VERSION`, baked at image build time
  from the CI's `VERSION` build-arg; `dev` locally) plus the app-modules this agent
  exposes (`GW_APPS`). The launcher reads `apps` at boot to gate its tiles and
  routes; the PWA settings panel fetches it again on open, so the version names the
  server actually answering, not a cached bundle.
- `GET /api/repos` — fleet board: scans `<workspace>/<GW_FLEET_DIR>/*/.agent/status.md`
  (root `STATUS.md` tolerated for repos still on the old convention) and returns, per
  repo, the leading paragraph of the fiche, its open checkboxes, 30 days of commit
  counts, the branch and whether the clone is dirty. Sorted so whatever awaits a
  gesture comes first. Read-only, `git` calls bounded by a 5 s timeout — a broken
  repo yields a poor card, never a broken page.
- `GET /api/memory/tree` — read-only listing of the agent's memory dir
- `GET /api/memory/raw/<path>` — one memory file (`?download=1` forces attachment)
- `GET /api/tunnel` — VS Code tunnel reconnect helper: pending GitHub device
  code + vscode.dev link, parsed from the claude-pod mirrored output
- `GET /api/history` — replay of the current session transcript (the PWA
  restores the visible conversation on reload)
- `GET /api/workbook/list`, `GET|POST /api/workbook/state` — project workbooks:
  the agent emits `…/assets/workbook.json` files under its memory dir (pieces,
  cutting layout, assembly), the PWA renders them (4 linked views + fullscreen
  shop mode) and stores progress ticks in the sibling `workbook-state.json`.
- `GET|POST /api/todo/state` — todo tick overlay: ticking a task in the PWA is a
  gesture, not a memory edit, so it lands in `todo/todo-state.json` instead of
  the task's fiche. The front stacks it over `/api/memory/index` (overlay wins
  until the agent consolidates it into the fiche's `done:`, keeping the
  gesture's date). Three states per task id: ISO date (done), `false` (undone),
  absent (the fiche wins). Server-side merge, one tick per call.

The `*-state.json` overlays (`workbook-`, `voyage-`, `todo-`) are the **only**
files the gateway ever writes into the memory tree — path-locked, and git-ignored
on the agent's side. Every other memory write goes through the agent.
- `POST /mcp` — MCP server (streamable HTTP) exposing Alfred to **other agents**.
  One tool, `ask_alfred(request, task_id?, agent?)`: hands a natural-language
  task to Alfred, who files it with his own discipline; returns `{reply,
  task_id}`. Stateless — the task is the SDK session carried by `task_id`
  (pass it back to continue a clarification). Gated by `GW_MCP_TOKEN` (Bearer),
  independent of the OIDC session. Serialized with the PWA via the same lock.
- `GET|POST /api/confirm` — one-shot confirmation for sensitive tool actions:
  the PWA shield button arms a `GW_CONFIRM_TTL` (default 120s) window,
  `POST /api/confirm/consume` (localhost-only, meant for a PreToolUse hook)
  consumes it. In-memory on purpose: an agent with a shell can burn a pending
  confirmation, never mint one (arming requires the user's session).
- `GET /api/health`
- `GET /auth/login|callback|logout`, `GET /api/auth/config` — OIDC flow (when configured)

Messages sent while the agent is busy are queued client-side (type-ahead) and
fired automatically when the current turn finishes — no "agent busy" error.

On screens ≥ 960px the PWA adds a side panel: a todo board (parsed from the
todo markdown file: sections, due-date badges, attachments) and a memory
browser (tree, rendered markdown with resolved `[[wiki links]]`, inline
images, download links for other attachments). Phones stay chat-only.

Each channel keeps one session, resumed on every message
(`~/.agent-gw/session-<channel>.json`). Mount the same `/home/agent/.claude`
and `/workspace` volumes as `claude-pod` so both containers share sessions
and workspace.

Environment:

| Variable | Default | Purpose |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | — | Subscription token from `claude setup-token`. **Never set `ANTHROPIC_API_KEY`** — it silently overrides the subscription and bills API credits. |
| `GW_WORKSPACE` | `/workspace` | Agent working directory (`cwd` of every query) |
| `GW_CHANNEL` | `pwa` | Session channel name |
| `GW_MODELS` | `Fable:claude-fable-5,Opus:opus,Sonnet:sonnet,Haiku:haiku` | `Label:model` pairs for the PWA dropdown. CLI aliases resolve to the latest model of each family. |
| `GW_MEMORY_DIR` | `memory` | Memory dir shown in the PWA side panel, relative to the workspace |
| `GW_TODO_FILE` | `todo/taches.md` | Todo file for the dedicated view, relative to the memory dir |
| `GW_MEMORY_STORES` | *(unset — falls back to a single store on `GW_MEMORY_DIR`)* | Ordered list of memory **stores**, `id=path:mode` comma-separated (`perso=memory:rw,famille=/shared/famille:ro`). Paths are workspace-relative or absolute; mode is `rw` (default) or `ro`. The memory is then the **union** of the stores: a domain is not stored *in* one, it is **composed** from what each holds. **A logical path never carries the store** — `domaines/cadeaux/x` is a name, the store is a location; that is what lets a note move between circles without breaking a single wikilink or bookmark. Declaration order **is** precedence (narrowest circle first); a colliding path is reported in `/api/memory/tree.collisions`, never silently resolved. Writes always go to the **first** store. |
| `GW_AGENT` | `alfred` | The body's identity on the **MCP surface**: names the server, the tool (`ask_<agent>`) and the default allowed Host. A pod exposing `ask_alfred` while it actually tends repositories would be worse than useless — calling agents pick a tool by its name and description. Pair it with `GW_MCP_DESCRIPTION` (what the tool announces to other agents; deployment-specific prose, hence an env rather than code). |
| `GW_THEME` | `alfred` | Which **skin** dresses the launcher. A skin is a small module under `frontend/src/launcher/skins/` declaring only what differs between bodies — brand, crest, composer placeholder, home screen, status bar, busy indicator — plus a stylesheet scoped to `:root[data-agent="<id>"]`, and server-side assets under `app/static/skins/<id>/` (`icon.svg`, `manifest.json`) since the browser asks for the favicon and the manifest before any script runs. `alfred` is the neutral base: no attribute, no override, an existing pod does not move. Adding a theme is three files-worth of edits and touches nothing else; see the contract in `skins/index.js`. A skin declares **no routes**: a route is an app, it lives in the shell under `appOn()` — one locked inside a theme only exists under that theme. |
| `GW_TRACE` | `0` | Stream tool calls into the chat (`◇ <tool> · <target>`), grouped under their count. Live only — `/api/history` does not replay them. Only the tool **name** and a short target leave the server, never the full input (a Write carries a whole file, a Bash command may carry a secret). Off by default: a butler stays discreet, a coding agent that hides what it touches cannot be corrected. |
| `GW_FLEET_DIR` | `repos` | Where the fleet clones live, relative to the workspace — the source of `GET /api/repos` and of the `repos` app-module. Reads the **disk**, not the GitHub API. |
| `GW_APPS` | `todo,projets,atelier,planif,voyages` | App-modules the launcher exposes. The image is agent-agnostic; the launcher was not. Anything absent loses **both its tile and its route** — a bookmarked URL cannot revive a module this pod does not have. Memory browsing (fiches, domains) is not a module and is always on. The default is the historical set, so upgrading an existing pod changes nothing. Modules that have left `main.js` live in `frontend/src/launcher/apps/` — a registry mirroring the skins one, contract in `apps/index.js`. |
| `GW_FEATURES` | `scan,attach,eph,tunnel,sujets` | Shell capabilities — the second axis of modularity. `GW_APPS` says where you can **go**; this says what the chat can **do**. A barcode reader makes no sense on a coding agent. Anything absent is **removed from the DOM**, not hidden: an absent node takes no events, no keyboard focus, and cannot trigger a lazy bundle load (the barcode decoder is 448 kB). Capabilities with more than one entry point are gated at the source — dropping `attach` also kills paste and drag-and-drop, not just the 📎 button. **The 🛡 shield is deliberately not on this list**: it is a guard, not a component, and a guard you can switch off with an env var is a trap. Default = the historical set. |
| `GW_TUNNEL_LOG` | `~/.vscode-cli/tunnel.out` | Mirrored tunnel output (see claude-pod `TUNNEL_LOG`) |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URI` | *(unset)* | OIDC SSO (e.g. Authelia). All four required to enable; login then goes through the IdP and a 30-day session cookie. |
| `OIDC_ALLOWED_GROUP` | `admins` | IdP group required to log in |
| `GW_SESSION_SECRET` | *(random)* | Signs the session cookie; pin it or sessions reset on restart |
| `GW_AUTH_TOKEN` | *(unset)* | Fallback bearer token on `/api/*` when OIDC is not configured (dev only) |
| `GW_MCP_TOKEN` | *(unset)* | Service token gating `/mcp`. Unset ⇒ `/mcp` returns 401 (disabled). Other agents present it as `Authorization: Bearer …`. |
| `GW_PERMISSION_MODE` | `bypassPermissions` | Claude Code permission mode (headless) |

> ⚠️ The gateway exposes an agent that has shell access to its workspace.
> Do not expose it to the public internet — keep it behind a VPN/SSO layer.

### Format contracts ship **with the image**

A module is not just a tile and a route: it is also a **data format** the agent must
produce for the view to render it. Those contracts used to live in each agent's
workspace, hand-copied from the front-end docs — ~1000 duplicated lines across two
repos that deploy independently, each claiming to be the source of truth, with nothing
detecting the drift.

They are now **Claude Code plugins shipped inside the image** (`plugins/<module>/`),
loaded through `ClaudeAgentOptions.plugins` and gated by `GW_APPS`. A module that is off
brings no contract; a module that is on brings one that is necessarily current — same
image tag as the code that reads it.

- `fiches` — always loaded (memory browsing is not a module): the Markdoc block
  vocabulary and typed frontmatter.
- `atelier`, `voyages` — loaded only when the matching module is in `GW_APPS`.

**The boundary is what makes this work:** the image documents the **format** (how a
workbook is written), the workspace documents the **craft** (why cuts are grouped by
width). A format only changes when the code changes — a rebuild either way. Craft is
corrected as you go, and has no business inside an image.

### What the body tells the agent

`GW_APPS` and `GW_FEATURES` used to reach the **browser only**. The launcher hid a
tile while the agent kept believing the module was there — offering pages this pod
does not serve, and writing files nothing would ever render.

Both lists are now also appended to the agent's system prompt, at every turn and on
every channel (`system_prompt: {preset: "claude_code", append: …}`, so the workspace
`CLAUDE.md` still governs everything else). The append carries **state and nothing
else** — which modules and capabilities exist here. It never carries a data contract
or a piece of domain knowledge: those belong to the workspace, and an environment
variable is no place to document how a workbook is written.

> ⚠️ Options are built in **two** places (`_run_alfred` for MCP and scheduled turns,
> `run_turn` for the PWA). Wiring only one leaves an entire channel blind, with no
> visible symptom — `test/apps_test.py` forbids the literal preset to keep it that way.

## Local build

```sh
docker build -t claude-pod images/claude-pod
docker build -t agent-gw images/agent-gw
```
