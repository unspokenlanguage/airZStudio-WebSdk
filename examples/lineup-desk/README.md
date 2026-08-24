# Lineup Desk — plain-HTML example

A soccer **starting-XI** control desk built as a single `index.html` with **no
bundler, no Vite, no framework**. It shows the airZ SDK running on a raw web page
via the **global build** (`window.Airz`).

What it does:

- Team name + coach name.
- Formation picker (4-4-2, 4-3-3, 3-5-2, 4-2-3-1, 5-3-2, 3-4-3). Switching the
  formation keeps the same 11 players and just re-lays them out — the
  "4-4-2 vs 3-5-2" flip.
- Per-slot shirt number + player name, with an auto-positioned pitch preview.
- **Discovery:** after login it fetches the playlist tree — a **Rundown** dropdown
  (`rundowns.list`) and an **Item** dropdown (`items.list`). Items are labelled by
  their title / Rive template **name**, not the numeric id.
- **Mapper:** picks the selected item's template and reads its real Rive
  databindings (`describeTemplateBindings`). **Data** bindings get a dropdown to
  choose which desk field feeds them, plus a format. **Trigger** bindings (e.g.
  `Animate In trigger`) instead bind to the **TAKE** or **TAKE OUT** button that
  fires them (auto-detected from the name, editable). So the desk works against
  **any** key names, not just ones that happen to match.
- **Push / TAKE / TAKE OUT** go through a `PanelBinder`: Push maps + formats +
  **diff-pushes only what changed**; TAKE flushes + fires the in-trigger; TAKE OUT
  fires the out-trigger (`binder.fire`, no flush). Both trigger names are editable.
  No controller connected? Push runs a dry-run and prints the source doc.
- **Extra bindable toggles**: three checkboxes (`1-5-4-1`, `3-5-2`, `Pressed`) become
  boolean desk fields you can map to Rive booleans in the mapper.
- **Live Rive preview** (Preview → **Rive**): fetches the selected item's actual
  `.riv` (`templates.get(id).fileUrl`) and renders it on a canvas with the Rive web
  runtime, driven through the **same mapping** — data fields set view-model
  properties as you type, TAKE / TAKE OUT fire the bound triggers. Falls back to the
  HTML pitch (the default) when offline or when a `.riv` has no bindable view-model.

### Rive preview — what it needs
The runtime is loaded from a CDN (`@rive-app/canvas`), so this mode needs internet.
The `.riv` is fetched from the controller with your bearer token, so the controller
must **allow CORS** for the page's origin. It uses `autoBind` + the view-model API
(`vm.string/number/boolean(key).value`, `vm.trigger(key).trigger()`); if a template's
view-model property names differ from its binding keys, adjust the mapping keys to
match. The HTML pitch preview needs none of this and always works.
- **Air policy** (per panel, remembered per template):
  - **cue** — Push *prepares* data on the preview; it reaches program only on TAKE.
  - **live** — once taken on air, every Push *streams* straight to program (ticker-style).
  - **On air** toggle is the operator state: off = rehearse (everything stays on preview).

## Run it

The SDK global is a build artifact (git-ignored `dist/`), so build it once. Run
each line separately — Windows PowerShell 5.1 does not accept `&&`:

```powershell
cd sdk
npm install
npm run build
```

Then serve the **repo root** over HTTP (ES scripts don't load from `file://`) and
open the page:

```powershell
npx serve .
```

→ `http://localhost:3000/examples/lineup-desk/`

(On bash/PowerShell 7 you can chain with `cd sdk && npm install && npm run build`.)

## How the SDK is loaded (Option C)

One script tag, that's the whole integration:

```html
<script src="../../sdk/dist/airz-sdk.global.min.js"></script>
<script>
  const client = Airz.createClient({ baseUrl: "http://localhost:3467" });
  await client.auth.login("admin", "your-password");   // stores the token on the client
  await client.items.setData(rundownId, itemId, { TEAM_NAME: "Anadolu FK", /* … */ });
  await client.items.trigger(rundownId, itemId, "TAKE");
</script>
```

> The desk logs in with **username + password** (same as the election config) — you
> don't paste a raw token. `login()` calls `POST /auth/login` and keeps the returned
> bearer token on the client for every later call.

`window.Airz` exposes the **same** surface as the npm package — `createClient`,
`AirzClient`, `BindingSync`, `PanelBinder`, `RundownStream`, etc. — because it is
bundled straight from `sdk/src`. Rebuild the SDK and the global tracks it.

Two things that trip people up with plain HTML:
- **Serve over HTTP**, not `file://`.
- **CORS**: your page's origin calling the API on `:3467` is cross-origin, so the
  API must allow it (or serve the page from the same origin). SSE (`client.stream`)
  has the same requirement.

## Discovery + mapping (the election-desk model)

```js
const rundowns = await client.rundowns.list();          // Rundown[] (name, itemCount)
const items    = await client.items.list(rundownId);    // RundownItem[] (title, type, templateId)
const bindings = await Airz.describeTemplateBindings(client, item.templateId); // [{key,type}]

// Compile a mapping into a diffing binder:
const spec   = Airz.configToPanelSpec(
  { panelId: "lineup", rundownId, itemId, air: "cue",
    fields: [ { to: "HomeGK", from: "P1_NAME", format: "upper" }, /* … */ ] });
const binder = new Airz.PanelBinder(client).setOnAir(false);
binder.add(spec);
await binder.updateOne("lineup", deskFeed);  // prepare (preview)
await binder.take("lineup", "TAKE");         // flush + fire trigger (to air when setOnAir(true))
```

`to` is the Rive databinding key, `from` is the dotted path into your source doc,
`format` is `int` / `dec1` / `dec2` / `pct1` / `pct2` / `trInt` / `upper` / `none`.

## Source-document shape (the desk feed)

`TEAM_NAME`, `COACH_NAME`, `FORMATION`, then per player `P1..P11`:
`P{n}_NAME`, `P{n}_NUM`, `P{n}_POS`, `P{n}_X`, `P{n}_Y` (X/Y are 0–100 pitch
coordinates, forward = right). The mapper decides which of these feed which Rive
key; unmapped keys are simply not sent.
