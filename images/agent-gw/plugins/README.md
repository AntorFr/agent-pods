# Plugins — extending an agent body without touching it

> This directory is the **boundary**. What lives here extends an agent; what lives in
> `app/` is the body itself. One rule decides everything: **the body knows no plugin by
> name.** It discovers them, decides which are active, and wires up whatever they bring.
> That single property is what makes a plugin shippable from another repository — and
> it is the one not to break.

## A plugin is a folder plus a manifest

```
plugins/<id>/
  gw-plugin.json            REQUIRED — this is what makes the folder a plugin
  .claude-plugin/plugin.json
  skills/<name>/SKILL.md    the contract the agent must follow
  api.py                    a FastAPI `router`, mounted at startup
  setup                     an idempotent executable, run at startup
  bin/*                     executables, installed on PATH at BUILD time
  tools/*                   the Claude Code plugin's own tooling
```

Everything is optional **except `gw-plugin.json`**. A plugin may be nothing but a
contract (`fiches`), an executable and its procedure (`git`), or both plus an API
(`voyages`). Nothing is registered anywhere: the **presence of a file** under the
expected name is the declaration. The body looks; it does not read a list.

`<id>` is the **folder name**, and the folder wins: that is what you write into
`GW_APPS` or `GW_TOOLS`. A manifest claiming a different `id` is reported and ignored.

## The three kinds — `kind`

A plugin is not always an app. That is what `kind` says, and it decides **when the
plugin is active**:

| `kind` | Active when | What it is for |
|---|---|---|
| `socle` | **always** | What every agent must have: the contract for writing memory (`fiches`), or a body capability with no tile of its own (`parcours`). |
| `app` | its `id` is in **`GW_APPS`** | A launcher module: a tile, a route, a data format. |
| `outil` | its `id` is in **`GW_TOOLS`** | An agent capability — an executable, a procedure — with **nothing in the interface**. `git` is the textbook case: publishing is not a screen, and not every body is entitled to it. |

An unknown `kind` does not fall back to a default: the plugin is **ignored**, loudly. A
plugin you believe is loaded but is not costs far more than one that is refused out
loud.

## What an ACTIVE plugin contributes

**`skills/` + `.claude-plugin/plugin.json`** — the contract is handed to the Claude SDK
(`ClaudeAgentOptions.plugins`). This is the whole point of the mechanism: the contract
**ships with the code that reads it**, in the same image tag, so it cannot drift from
it. A plugin without `.claude-plugin/plugin.json` is simply not passed to the SDK — it
has no contract to offer, which is not an error.

**`api.py`** — if it exposes a `router` (`fastapi.APIRouter`), it is mounted at startup.
An **inactive plugin does not mount its API**: consistent with its missing tile, and it
removes the surface instead of leaving it answering into the void. An API that fails to
import is **reported and skipped** — the body keeps serving. A broken plugin costs you
its view, not the gateway.

**`setup`** — run at every startup, therefore **idempotent by contract**. This replaces
commands that used to be typed by hand inside the pod: a recreated pod lost them, and
nobody noticed until the first failure. 30 s budget; its output goes to the logs.

**`bin/`** — installed on PATH **at build time**, for every body, unconditionally. This
is not a hole in the gating: the Dockerfile knows nothing about the pod's environment,
and an executable is **inert until something calls it**. `setup` is what wires it up,
and `setup` only runs when the plugin is active.

## What stays in the body, and why

Two executables live at the `agent-gw` root rather than in a plugin: `rosetta-bridge`
(every agent talks to the hub) and `memory-sync` (every agent writes its memory). They
are not optional — a body without them is not a reduced body, it is a dead one.

**The scheduled-task clock** (`app/planif.py`) also stays in the body, even though it
has a tile. The reason is sharp: it needs to start an agent turn (`_run_alfred`), so it
calls back into the body. A plugin that calls back into the body is not a plugin, it is
a piece of the body filed elsewhere. Its tile is gated by `GW_APPS` on the front end,
its clock by `GW_PLANIF` — and the two are independent, which is the intended behaviour:
a body with no visible module must still honour its scheduled tasks.

## Writing a plugin — the short list

1. `plugins/<id>/gw-plugin.json`: `{"id": "<id>", "kind": "…", "description": "…"}`.
2. Whatever it brings, under the names above. Nothing to register anywhere.
3. `<id>` in the pod's `GW_APPS` or `GW_TOOLS` (not needed for a `socle`).

Design archives sit next to the plugin they describe (`plugins/voyages/VOYAGES.md`,
`plugins/parcours/PARCOURS.md`, `plugins/atelier/ATELIER-3.md`): the reasoning travels
with the code, so a plugin folder is self-contained down to its *why*.

One frontier is still uncrossed: the front end keeps its own registry
(`frontend/src/launcher/apps/index.js`), so an app wanting a **screen** must still put
its factory there. A third-party plugin can today ship a contract, an API, an executable
and its procedure — but not yet a view.

> **A note on language.** This file is in English because it addresses people outside
> this repository. The agent-facing contracts (`skills/*/SKILL.md`) are in French, like
> the agent workspaces that consume them, and so are the design archives.
