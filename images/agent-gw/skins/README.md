# Skins — what a body looks like

> A sibling tree to `plugins/`, on the same discovery principle, for a different
> kind of object. The distinction is worth stating once, because collapsing the two
> is tempting and wrong:
>
> - a **plugin** *adds* a capability, and **several are active at once** — gated by a
>   list (`GW_APPS`, `GW_TOOLS`, `GW_FEATURES`);
> - a **skin** *dresses*, and **exactly one is active** — chosen by a value (`GW_THEME`).
>
> Making skins a fifth plugin kind would have meant a kind whose axis is not a list
> but a single value: the sort of exception that empties a rule of its meaning.

## A skin is a folder

```
skins/<id>/
  gw-skin.json        REQUIRED — { id, description }
  skin.js             the factory `(api) => skin` (contract below)
  skin.css            its tokens, scoped `:root[data-agent="<id>"]` — and nothing else
  assets/icon.svg     favicon and home-screen icon
  assets/manifest.json  PWA manifest overrides
```

Everything is optional except `gw-skin.json`. Add `GW_THEME=<id>` on the pod and
nothing else: no line to add to a registry, no import to remember.

Note the shape difference with a plugin: a skin's code sits at the folder root, not
under `web/`. A plugin can bring several facets (contract, API, view, chrome, binary)
so it needs the split; a skin has one, and inventing a subfolder for it would be empty
ceremony.

## Why the assets are served, not bundled

`skin.js` and `skin.css` are collected at build time into the launcher bundle.
`assets/` is **not**: the Dockerfile copies it to `app/static/skins/<id>/`, where the
server reads it. The reason is not symmetry but sequence — **the browser asks for the
favicon and the manifest before a single line of the bundle runs.** Anything the page
needs before boot cannot come from a client-side registry.

`_skin_asset` in `app/main.py` prefers the active skin's file and falls back to the base
one, so a skin only ships what it actually changes.

## The contract

`skin.js` exports `(api) => skin`. Every field is optional; an absent field means the
shell's own behaviour.

| Field | Type | What it is |
|---|---|---|
| `brand` | string | the name shown in the shell |
| `crest` | string | SVG markup for the header crest, in `currentColor` |
| `title` | string | document title (the browser tab) |
| `placeholder` | string | the composer's prompt |
| `idleLabel` | string | tooltip of the activity light at rest |
| `busyLabel` | string | text shown while a turn is running |
| `busyNode` | `() => Node\|null` | the working indicator; `null` ⇒ the three dots |
| `console` | `(api, info) => Node\|null` | a status bar at the top of the apps column |
| `home` | `() => void` | renders the root; absent ⇒ the shell's tile mosaic |

**No `routes`, deliberately.** The contract accepted them once, which amounted to
lodging an *app* inside a livery: the `repos` view existed only under Skippy's skin
while `/api/repos` answered under every theme, so `GW_APPS=repos` on a neutrally
dressed pod gave a dead route. A route is an app; it lives in the shell under
`appOn()`. The home screen stays the one view a skin may provide — it is the only
screen whose *shape* is the body's identity.

The whitelist is enforced in code, not just in prose: anything off-contract is dropped
**and reported**, because a silently ignored field is an hour spent wondering why
nothing happens.

## Alfred is a skin now

He used to be the *absence* of one — `NEUTRAL = { id: 'alfred' }`, every field falling
through to what `app.html` already said. It worked, but one of the three bodies could
not be read anywhere: you could open a file for Skippy and Nestor, and had to
reconstruct Alfred from markup.

He is declared in `skins/alfred/` with **the exact values `app.html` already carries**,
so nothing moved. Two things he deliberately does not have:

- **no `skin.css`** — his palette *is* the base sheet (`launcher.css`). An override
  restating it would create two sources for one look, and the day they disagreed the
  base would win in silence;
- **no `home`** — the tile mosaic is the shell's default, not Alfred's property. A body
  that declares none gets it, which is what an unknown theme must keep getting too.

`app.html` keeps its defaults, and that is not duplication awaiting cleanup: the browser
paints the shell before the bundle runs. The rule to remember — **the skin is what a
body IS, `app.html` is what the browser sees FIRST.** They must agree, and
`test/apps_test.py` checks that they do.
