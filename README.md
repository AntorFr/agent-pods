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

- `POST /api/chat` — send a message (`{message, model?}`), stream the agent's reply (SSE)
- `POST /api/reset` — start a fresh session for the channel
- `GET /api/models` — models offered in the PWA dropdown
- `GET /api/memory/tree` — read-only listing of the agent's memory dir
- `GET /api/memory/raw/<path>` — one memory file (`?download=1` forces attachment)
- `GET /api/tunnel` — VS Code tunnel reconnect helper: pending GitHub device
  code + vscode.dev link, parsed from the claude-pod mirrored output
- `GET /api/history` — replay of the current session transcript (the PWA
  restores the visible conversation on reload)
- `GET /api/workbook/list`, `GET|POST /api/workbook/state` — project workbooks:
  the agent emits `…/assets/workbook.json` files under its memory dir (pieces,
  cutting layout, assembly), the PWA renders them (4 linked views + fullscreen
  shop mode) and stores progress ticks in the sibling `workbook-state.json` —
  the only file the gateway ever writes into the memory tree (path-locked).
- `GET|POST /api/confirm` — one-shot confirmation for sensitive tool actions:
  the PWA shield button arms a `GW_CONFIRM_TTL` (default 120s) window,
  `POST /api/confirm/consume` (localhost-only, meant for a PreToolUse hook)
  consumes it. In-memory on purpose: an agent with a shell can burn a pending
  confirmation, never mint one (arming requires the user's session).
- `GET /api/health`
- `GET /auth/login|callback|logout`, `GET /api/auth/config` — OIDC flow (when configured)

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
| `GW_TUNNEL_LOG` | `~/.vscode-cli/tunnel.out` | Mirrored tunnel output (see claude-pod `TUNNEL_LOG`) |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URI` | *(unset)* | OIDC SSO (e.g. Authelia). All four required to enable; login then goes through the IdP and a 30-day session cookie. |
| `OIDC_ALLOWED_GROUP` | `admins` | IdP group required to log in |
| `GW_SESSION_SECRET` | *(random)* | Signs the session cookie; pin it or sessions reset on restart |
| `GW_AUTH_TOKEN` | *(unset)* | Fallback bearer token on `/api/*` when OIDC is not configured (dev only) |
| `GW_PERMISSION_MODE` | `bypassPermissions` | Claude Code permission mode (headless) |

> ⚠️ The gateway exposes an agent that has shell access to its workspace.
> Do not expose it to the public internet — keep it behind a VPN/SSO layer.

## Local build

```sh
docker build -t claude-pod images/claude-pod
docker build -t agent-gw images/agent-gw
```
