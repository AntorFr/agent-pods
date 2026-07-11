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
(seeded once into the persisted home).

## agent-gw

HTTP server (port 8000) serving a minimal chat PWA and an SSE API:

- `POST /api/chat` — send a message, stream the agent's reply (SSE)
- `POST /api/reset` — start a fresh session for the channel
- `GET /api/health`

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
| `GW_AUTH_TOKEN` | *(unset)* | Optional bearer token required on `/api/*` |
| `GW_PERMISSION_MODE` | `bypassPermissions` | Claude Code permission mode (headless) |

> ⚠️ The gateway exposes an agent that has shell access to its workspace.
> Do not expose it to the public internet — keep it behind a VPN/SSO layer.

## Local build

```sh
docker build -t claude-pod images/claude-pod
docker build -t agent-gw images/agent-gw
```
