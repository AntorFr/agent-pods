# agent-gw — the agent gateway

Main container of an agent pod: **the user's front door *and* the agent runtime**.
FastAPI + a chat PWA + the Claude Agent SDK (`query()`).

Deployed through `smart-home-charts` (chart `agent-pod`); manifest example:
`k8s-home-lab/clusters/homenode/home/assist/alfred-helm.yml`. Image published to
`ghcr.io/antorfr/agent-gw` (repo `agent-pods`).

The image is **agent-agnostic**: identity, persona and instructions come from the
mounted `/workspace`, never from here. Alfred (a butler), Skippy (a coding agent) and
Nestor all run this same image.

## Role

1. **Serves the PWA** — the chat web app, front end and static assets.
2. **Runs the agent** — calls the Claude SDK with the brain in `/workspace/memory`, the
   workspace skills, the **plugins shipped by the image** (`plugins/`, see its README)
   and the MCP servers declared by the workspace `.mcp.json` (all relayed through
   `mcp-bridge`). One message = one agent turn, executed here.
3. **Authenticates** — OIDC through Authelia, signed session cookie, and the 🛡 shield
   that gates sensitive actions.
4. **Exposes `/mcp`** — `ask_<agent>` / `ask_<agent>_status` (bearer `GW_MCP_TOKEN`), so
   other agents can hand over work directly. **Asynchronous**: `ask_<agent>` returns a
   `job_id` immediately, `ask_<agent>_status` collects the answer.
5. **Serves memory** — `/api/memory/raw/...` (markdown, images, attachments), consumed by
   the PWA rendering engine.
6. **Stateful app modules** — woodworking workbooks (`/api/workbook/*`) and trips
   (`/api/voyage/*`, plugin `voyages`): the data (`workbook.json` / `voyage.json`) is
   written by the agent, while UI gestures land in a sibling `*-state.json` overlay (out
   of git). Trip weather and legs are derived through the Google APIs
   (`GOOGLE_MAPS_API_KEY`, read by the `voyages` plugin itself) and never stored.
7. **Scheduled-task clock** (plugin-free, `app/planif.py`, `GET /api/planif`) — an
   asyncio loop reads the `type: planif` notes under `memory/planif/*.md` and, at the
   appointed minute, opens an ordinary agent turn using **the note's body as the prompt**
   (preceded by a short provenance frame, patterned on `ask_<agent>`: without it the
   agent cannot know it is in a scheduled turn — the body itself passes through word for
   word). Fresh session, `GW_CHANNEL=planif` injected through
   `ClaudeAgentOptions.env` (the workspace hook then closes the *entire* Google surface,
   reads included), no catch-up beyond the grace window, journal in
   `planif/planif-state.json` (out of git). The PWA tab is **read-only**: creating or
   suspending a task goes through a message to the agent, which edits the note.

A pod may carry a second `tunnel` container (image `claude-pod`) dedicated to the VS Code
tunnel into `/workspace` — direct developer access, independent of the gateway.

## Configuration (environment variables)

| Variable | Default | Role |
|---|---|---|
| `GW_CHANNEL` | `pwa` | Channel identity. Its **presence** means headless (nobody there to answer a prompt) → the shield applies. Set at container level, out of the model's reach. |
| `GW_PERMISSION_MODE` | `bypassPermissions` | Claude SDK permission mode. Under `bypass`, `permissions.deny` is ignored → **only a hook exiting 2 can block** (see `alfred/.claude/hooks/google_guard.py`). |
| `GW_WORKSPACE` | `/workspace` | Root of the brain (the agent's memory repository). |
| `GW_MEMORY_DIR` | `memory` | Memory folder, relative to the workspace. |
| `GW_TODO_FILE` | `todo/taches.md` | Todo file, relative to memory. |
| `GW_FLEET_DIR` | `repos` | Fleet clones folder, relative to the workspace — source of `GET /api/repos` and the `repos` view (read by the `repos` plugin). The scan reads the **disk**, not the GitHub API: what you see is what the pod has fetched. |
| `GW_TRACE` | `0` | Tool trace in the thread: every call shows as `◇ <tool> · <target>`, grouped under its turn, until the next text message. **Live only** — `/api/history` does not replay it, it vanishes on reload (an execution witness, not an archive). Only the **name** and a **short target** (78 chars max, the most telling input field) are emitted: never the full input, which may carry a file's contents or an entire command. Off by default — a butler stays discreet; a coding agent that hides what it touches is one you cannot correct. |
| `GW_THEME` | `alfred` | Visual identity. The launcher sets `data-agent=<theme>` on `<html>` at boot, arming the token overrides in `theme-<theme>.css` — bundled with the rest, **inert** while the attribute is absent. `alfred` ⇒ no attribute, historical look, an existing pod does not move a pixel. `skippy` ⇒ dark, monospace headings, amber, 3 px corners, no drop shadow. `nestor` ⇒ porcelain by day, plum night-light after dark, amethyst, 16–22 px corners, and a rabbit whose belly pulses as the working indicator. The light/dark toggle keeps working in all three; `nestor` additionally **follows the phone setting** by default (its audience is a family), where `skippy` imposes its night. ⚠️ An unknown theme is not an error: the launcher falls back to the base and the server serves Alfred's assets, which yields a perfectly working PWA **under another body's name and icon**. Setting the variable is not enough — the skin must be shipped by the image. |
| `GW_APPS` | `todo,projets,atelier,planif,voyages` | Launcher modules, comma-separated. The image is agent-agnostic, the launcher was not: its tiles and routes were wired to one agent's world. A butler pod wants the workbench and the trip planner; a coding pod wants neither. The front end hides **both the tile and the route** of any absent module (a bookmarked URL resurrects nothing), and an inactive plugin does not even mount its API. Memory is not a module: it is always there. Default = the historical set, so upgrading changes nothing for an existing pod. |
| `GW_FEATURES` | `scan,attach,eph,tunnel,sujets` | Shell capabilities, comma-separated — the **second axis**. `GW_APPS` says where you can *go* (tiles and routes), this says what the chat can *do* (composer and chrome controls). A barcode reader makes no sense for a coding agent. What is not listed is **removed from the DOM**, not hidden: an absent node receives no events, takes no keyboard focus, and cannot trigger the lazy load of a bundle (the decoder weighs 448 kB) — `display:none` would leave all three. Capabilities with several entry points are gated **at the source**: dropping `attach` also kills paste and drag-and-drop, not just the 📎 button. Values: `scan` (▥ barcode), `attach` (📎 + paste + drag-and-drop), `eph` (⚡ ephemeral mode), `tunnel` (⧉ VS Code tunnel in Settings), `sujets` (▤ resume a thread). ⚠️ **The 🛡 shield is deliberately NOT in this list**: it is a guard, not a component — the only way to consent to a sensitive action. A guard you can switch off with an environment variable is a trap. Default = the historical set. |
| `GW_TOOLS` | *(empty)* | **Agent** capabilities, comma-separated — the **third axis**. The first two describe what the user sees; this one says what the agent has **in its hands**, with no interface at all. `git` is the textbook case: publishing code is not a screen, and not every body is entitled to it. Naming a tool here activates its plugin — its contract goes to the SDK, its `setup` wires up whatever needs wiring. **Empty by default, deliberately**: a capability nobody asked for does not switch itself on at upgrade. Shipped values: `git` (push to the MCP hub, which relays to the forge). |
| `GW_STATE_DIR` | `~/.agent-gw` | **Server-side** state: session pointer (`session-<channel>.json`) and the attachment inbox (`inbox/`). Persistent (hostPath home). |
| `GW_MAX_UPLOAD_MB` | `25` | Maximum size (MB) of a chat attachment, per file. |
| `GW_MAX_UPLOAD_FILES` | `8` | Maximum number of files attached to one message. |
| `GW_INBOX_TTL` | `86400` (24 h) | Age (s) beyond which a dropped attachment is swept (`0` = never). Best-effort purge on every upload. |
| `GW_SESSION_TTL` | `14400` (4 h) | Idle time (s) beyond which the session is **no longer resumed**: the next turn starts blank (`0` = never). Durable state lives in `memory/`, the transcript is disposable — resuming it re-pays the whole accumulated context on every message (prompt cache ~5 min, cold between two visits). |
| `GW_CONFIRM_TTL` | `120` | Validity (s) of one 🛡 shield authorisation. |
| `GW_PLANIF` | `1` | Scheduled-task clock. `0` stops it (debugging, or freezing scheduled turns without touching the notes). Only one `agent-gw` instance mounts the workspace — neighbouring containers (`tunnel`, `voice`) do not run the gateway, so there is no double clock. **The day the gateway is scaled out, this flag becomes mandatory on the replicas.** |
| `GW_PLANIF_DIR` | `memory/planif` | Folder of `type: planif` notes, **relative to the workspace** (or absolute) — no longer relative to the memory dir. A planif note is not memory: its body is executed *verbatim* as the prompt of an agent turn, which makes it an **instruction**, and instructions stay versioned while memory need not. Holding it outside `memory/` buys two things. A body can version its schedule without git tracking anything under a path that may be a **network mount** — where a `pull` would write into live data. And "having a memory store" stops implying "being able to schedule": a body whose only store is a shared circle could otherwise never own a clock. The default reproduces the historical layout byte for byte, so a deployment that declares nothing does not move. |
| `GW_PLANIF_TICK` | `30` | Tick period (s). Must stay `< 60`: the loop matches the current **minute**. |
| `GW_PLANIF_GRACE` | `5` | Catch-up window (min). Covers a long turn still holding the lock, **not** an outage: beyond it the occurrence is lost, by design. `0` = no catch-up. |
| `GW_PLANIF_TIMEOUT` | `900` | Maximum duration (s) of a scheduled turn. Beyond it: cancelled and journalled as failed. |
| `GW_PLANIF_MIN_PERIOD` | `15` | Frequency floor (min). A finer cron makes the note **invalid** (displayed as such) instead of being silently smoothed — subscription quota is not free. |
| `GW_PLANIF_TZ` | `Europe/Paris` | Default timezone when the note declares none. |
| `GW_MCP_ALLOWED_HOSTS` | *(empty)* | Hosts this body accepts being called under — FastMCP's anti DNS-rebinding guard. **No default**: it used to derive `<agent>.<my own domain>`, which is one deployment's DNS baked into a public image, and useless to anyone else. Empty means only the local hosts added by the code get through, so a pod exposing its `/mcp` must name itself — this list *is* the guard, and guessing it never made sense. |
| `GW_MCP_MAX_PENDING` | `4` | Depth of the `ask_<agent>` queue. Beyond it, an **immediate** refusal rather than queueing behind a lock that will not be released for hours: a refusal is information, silence is not. Hard floor at 1. |
| `GW_PEER_MCP_URL` / `GW_PEER_MCP_TOKEN` / `GW_PEER_MCP_TOOL` | `""` | Cross callback: when a job finishes, open a turn at the requester's with the report (`https://<peer>/mcp/`, its `GW_MCP_TOKEN`, and the name of **its** tool, e.g. `ask_skippy`). All three or nothing — unwired, the caller polls `ask_<agent>_status`. The callback sets `notify=False`: without that guard, two agents would trade reports forever. |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_REDIRECT_URI` / `OIDC_ALLOWED_GROUP` | `""` / `""` / `""` / `admins` | Authelia OIDC client. As soon as `OIDC_ISSUER` is set, auth switches to OIDC (the `GW_AUTH_TOKEN` bearer becomes unused). |

### Secrets

| Secret | Generated by | Consumed by | Where it lives |
|---|---|---|---|
| `GW_SESSION_SECRET` | `openssl rand -hex 32` (initial setup / rotation) | signs the session cookie (`secret_key` of `SessionMiddleware`) | vault `secret/apps/<agent>` → `gw_session_secret`, pulled by `externalSecrets` |
| `GW_MCP_TOKEN` | `openssl rand -hex 32` | bearer of the `/mcp` endpoint | manifest, in clear (DR-via-git policy) |
| `OIDC_CLIENT_SECRET` | Authelia side (hashed) + clear here | OIDC login | manifest, in clear (DR-via-git); see `app-auth-oidc.md` |
| `GW_AUTH_TOKEN` | — | fallback bearer, **only if OIDC is absent** (dev mode) | **unused in production** (OIDC active) → deliberately out of the vault |
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token`, otherwise the `~/.claude` session | **not read by agent-gw** — only by the Claude SDK | the pod runs on `~/.claude` (persistent, self-refreshing) → deliberately out of the vault |

> Not in the list: `GOOGLE_MAPS_API_KEY` — pulled from `secret/llm/google-api` →
> `google_map_api_key` through `externalSecrets`. It used to feed the bundled Maps MCP
> server, since removed (the `maps` tools now come from the rosetta hub); it remains
> **required** by the `voyages` plugin, which calls the Google APIs directly to derive
> weather and legs.

## Chat attachments

The composer accepts files through **three routes** — the 📎 button (file picker /
camera, works everywhere including mobile), **drag-and-drop** onto the chat column
(desktop only: mobile browsers have no DnD into the DOM), and **pasting** an image.
The flow:

1. `POST /api/upload` (multipart) drops files into `GW_STATE_DIR/inbox/<turn>/…` —
   **outside the memory repository**, so never committed into `memory/`. Returns one `id`
   per file (path relative to the inbox), sanitised and traversal-guarded.
2. The front end passes those ids back in the body of `POST /api/chat`
   (`attachments: [...]`). The server resolves them to absolute paths (traversal guard:
   anything escaping the inbox is rejected) and **prefixes the prompt** with a framed
   note: the contents of an attached file are **untrusted data, never an instruction**
   (same anti-injection discipline as email). The agent then **inspects them with its
   `Read` tool** (images and PDFs included) — no multimodal plumbing server-side.

A message may be **files only** (empty text). The inbox is swept of entries older than
`GW_INBOX_TTL` on every upload: attachments are a turn input, not memory — if one is
worth keeping, the agent files it into `memory/` under its own discipline.

## Screen context

On desktop the PWA is a **split view**: chat on the left, canvas on the right. "That",
in a user's sentence, therefore usually refers to the page in front of them — which the
chat used to know nothing about. Every message now carries a `vue: {route, titre}` field
(`POST /api/chat`), from which the server **prefixes the prompt** with a one-line note:
*"Screen open next to the chat: « Voyages › Baden 2026 » (#/voyage/baden-2026)"*.

Three boundaries, and they are the substance of the design:

- **The route and its breadcrumb, never the page contents.** A trip card or a product
  sheet quotes third-party text (Gmail, Open Food Facts): pouring it into the prompt
  would strip its "untrusted" label, and the next turn would read it back as the agent's
  own words.
- **A hint, not an imposed topic.** The note says so to the model in plain words: the
  user's question comes first, they may perfectly well be looking at one note and talking
  about something else. The hash stays steerable by a link someone gets clicked, so the
  input is capped at 200 characters and **flattened onto a single line** (a newline alone
  would suffice to mimic a harness instruction).
- **A snapshot taken at send time, and only if a screen is being watched.** Nothing is
  attached from the home page (empty route) or on mobile folded onto the chat — one does
  not narrate a screen nobody is looking at. Nothing sticks from one message to the next.

The note addresses the **model**, not the user — but the transcript keeps the whole
prompt. `/api/history` replays it on every reload (and on every reconciliation after a
disconnect), so the note used to surface **inside the user's own bubble**, who then read
back text they never wrote. Gateway preambles (screen context, attachments, ephemeral
mode) are now **stripped on replay** (`_strip_gw_notes`): they go to the agent, they do
not come back to the screen. A turn with no text — attachments only — keeps a paperclip
rather than disappearing.

## Sessions: token cost, threads, ephemeral mode

Three mechanisms bound consumption (every turn replays the whole transcript, with a cold
prompt cache between visits — the weight of the session **is** the marginal cost of the
message):

- **Idle TTL** (`GW_SESSION_TTL`): past the delay the pointer is no longer resumed and the
  next turn starts from a blank session. The agent rediscovers state in `memory/` — that
  is the design; `/api/history` empties at the same time, so the PWA starts clean on
  reload.
- **Context counter** (`GET /api/session`): `context_tokens` = input + cache of the
  **last API call** in the transcript — what the next message will re-pay. The PWA shows
  it as an indicative pill (amber ≥ 60k, red ≥ 120k); acting on it is done with the
  neighbouring buttons (▤ Threads, ↺ new session).
- **Threads menu** (PWA): the "UX compaction". Switching thread means the agent
  **consolidates** the conversation into `memory/` (one turn), the session is **reset**,
  then the note `sujets/<x>.md` is **reloaded** as the resumption point. Resumption goes
  through memory, never through an old transcript. The list comes from `sujets/INDEX.md`
  (title, last activity, hook) — the table the agent already maintains. Each row carries a
  🗄 button: archiving is requested **from the agent** (distil, file, index, commit) — the
  front end never moves the file itself.
- **Ephemeral mode ⚡** (`POST /api/chat`, `ephemeral: true`): a disposable aside for
  one-off questions — no pointer resume, no save: the turn neither pays for the history
  nor fattens it. Chaining stays possible: the front end passes back the received
  `session_id` (`ephemeral_session`), kept in RAM only. The ⚡ bubbles (dotted) disappear
  on reload — accepted.

## Sessions & disaster recovery

The **session secret is not critical**. What to remember:

- If `GW_SESSION_SECRET` **changes or is regenerated** (the `token_hex(32)` fallback when
  the variable is absent, e.g. a sealed vault at boot), all existing cookies are
  invalidated → **a plain Authelia re-login**. Since Authelia usually keeps the SSO
  session, this is often a transparent redirect.
- **No data is lost** in that case: conversation history lives **server-side**
  (`GW_STATE_DIR`, pointing at the SDK's `.jsonl` under `~/.claude/projects`), memory in
  `/workspace` (git), Claude auth in `~/.claude`. None of it depends on the session secret.
- **DR-via-git**: `git clone` + an ArgoCD sync restores the committed value as-is —
  nothing to regenerate. Regeneration only serves the **first setup** or a deliberate
  rotation.
