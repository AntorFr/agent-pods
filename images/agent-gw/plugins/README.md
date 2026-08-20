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
  web/app.js                a launcher view, bundled at BUILD time
  web/app.css               its styles, imported from app.js
  web/blocks.js             Markdoc tags for the content engine
  web/blocks.css            their styles, collected separately (see below)
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

Two executables live in **`bin/` at the image root** rather than in a plugin:
`mcp-bridge` (every agent talks to the hub — it is how *all* its MCP tools arrive) and
`instruction-sync` (every agent's *instructions* are co-edited). They are not optional — a
body without them is not a reduced body, it is a dead one.

`memory-sync` sat there until 2026-08-20, on the premise that *every agent commits its
memory*. That premise is gone: memory left git and now lives on the filesystem, with ZFS
snapshots as its net. Writing a fact is writing a file — nothing to synchronise, so the
tool was **removed** rather than kept as a no-op.

`instruction-sync` is not that tool returning under a new name. Removing the old one is
what revealed what it had really been for: not the memory, but the **co-editing**. That
has not gone away, it moved. A body's repository holds `CLAUDE.md`, `DECISIONS.md`,
`.claude/` and `planif/` — written both by the pod (its self-improvement skill) and from
the dev machine. Two clones, one `origin`, conflicts **surfaced rather than guessed**. The
memory has a single writer and no remote at all; the instructions have two authors.

That gives the symmetry worth remembering: **`bin/` at the image root = what every body
owns; `plugins/<id>/bin/` = what a plugin adds.** Where a binary sits tells you whether
it is optional, without having to know it from somewhere else.

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

**`web/app.js`** — a launcher view. It exports a factory `(api) => ({ routes })`, and
`build/registry.mjs` collects it at **build time**: the front end is one esbuild bundle,
so a view has to be present when the image is built. That is the same rule as the rest —
a plugin travels in the same image tag as the engine that renders it, so the two cannot
drift. Declare the tile under `vue` in the manifest (`{label, ico, color}`); a view with
no tile is legitimate, it is a detail screen reached from another page.

⚠️ A view ships **JavaScript into the page**, so it can do anything the launcher can —
DOM, `fetch` with the user's session, and therefore `/api/chat`. There is no sandbox and
an `api` object would not be one: once code runs in the page, no API design bounds it.
The boundary here is review and the CI, not isolation. Keep that in mind before
vendoring a view you have not read.

**`web/blocks.js`** — Markdoc tags for the content engine, the vocabulary an agent
writes in a note. Exports a factory `(api) => ({ tags, mount? })`, where `api` carries the
engine's primitives (`Tag`, `asset`, `manque`) — injected rather than imported, because
the engine imports *you*, and the reverse would be a cycle. `mount` runs after the
rendered HTML is inserted: it is where a block fetches its data and paints, which
`render()` cannot do since it returns a string.

⚠️ **Do not import CSS from `blocks.js`.** The test suites import the engine in plain
node, which has no CSS loader — one `import './blocks.css'` there breaks every test
without teaching anyone anything. The generator collects `web/blocks.css` separately,
onto a path only esbuild walks.

Two registries, not one, and it is not gratuitous symmetry: views land in the **launcher**
bundle, blocks in the **engine** bundle. Merging them would drag a 1000-line map and its
styles into the launcher, which has no use for either — and a CSS import is a side effect
that tree-shaking does not remove.

One frontier is still uncrossed: **chrome**. A plugin cannot yet add a control to the
composer or an entry to the settings panel — those live in `app/static/app.html`, which
the core owns and `applyFeatures()` merely *subtracts* from. Turning that into slots a
plugin fills is the next step.

> **A note on language.** This file is in English because it addresses people outside
> this repository. The agent-facing contracts (`skills/*/SKILL.md`) are in French, like
> the agent workspaces that consume them, and so are the design archives.
