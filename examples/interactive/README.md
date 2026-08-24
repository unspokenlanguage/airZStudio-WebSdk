# airZ Interactive — the hostable preview + control surface

`interactive.html` is the **single, canonical** interactive Rive preview. It is meant
to be **served by the controller** (e.g. `http://controller:3467/interactive/...`) and
**embedded** everywhere a preview is needed — the playlist Item-Config panel, presenter
"Web Host" links, and any web-SDK app — none of which re-implement Rive rendering.

```
        ┌──────────────────────────────────────────────┐
        │  CONTROLLER :3467                             │
        │   /interactive/:rundownId/:itemId  ── this page (renders .riv + 2-way engine)
        │   /rundown/rive.js + rive.wasm  (vendored runtime)                          │
        └──────▲───────────────▲───────────────▲────────┘
               │ iframe         │ iframe         │ iframe / link
        Item-Config panel   web-SDK app     presenter "Web Host"
```

It renders the item's actual `.riv` (`templates.get(id).fileUrl`), auto-generates a
field per data binding + a button per trigger, and keeps the graphic and the controller
in **two-way sync** (outbound `prop.on` read-back, inbound SSE), bounded by the
**cue/live + on-air** policy so nothing hits program unintentionally.

## Files
- **`interactive.html`** — the hostable page (self-contained; loads the SDK global + Rive runtime).
- **`embed.js`** — `AirzInteractive.mount()`: mount the page in an iframe and drive it over `postMessage`.
- **`embed-demo.html`** — a host page that logs in, mounts the preview, and drives it (dev harness).

## Run in dev
Build the SDK global once (`cd sdk && npm run build`), serve the repo root, and open:
```powershell
npx serve .
```
- `…/examples/interactive/interactive.html?baseUrl=http://localhost:3467&rundownId=12&itemId=340` — standalone (shows a dev login when no token).
- `…/examples/interactive/embed-demo.html` — the embedding harness.

## Configuration (target + auth)
Resolved in order: **`window.__AIRZ__`** (controller-injected) → **URL query** → dev login.

| key | meaning |
|---|---|
| `baseUrl` | controller API base (defaults to `location.origin` when hosted) |
| `t` / `token` | bearer token; omit to show the dev login |
| `rundownId`, `itemId` | the playlist item to bind (item link) |
| `templateId` | a template sandbox (no item, no program impact) |
| `role` | `control` (default) or `view` (read-only) |
| `chrome` | `full` (default standalone) or `min` (canvas-only, for embedding) |
| `air`, `onAir` | initial air policy / on-air state |
| `parentOrigin` | when embedded, the only origin it will postMessage to / accept from |
| `riveRuntimeUrl`, `riveWasmUrl` | default `/rundown/rive.js` + `.wasm`; CDN fallback in dev |

## Embed API (`postMessage`)
**parent → frame:** `airz:setField {key,value}` · `airz:fireTrigger {name}` ·
`airz:setMode {mode:'cue'|'live'}` · `airz:setOnAir {on}` · `airz:reload`.
**frame → parent:** `airz:ready {bindings,item}` · `airz:valueChanged {key,value,origin}`
(`origin` = `presenter`|`remote`|`field`|`parent`) · `airz:triggered {name,origin}` ·
`airz:state {air,onAir,connected}` · `airz:error {message}`.

`embed.js` wraps all of this:
```js
const view = AirzInteractive.mount("#preview", {
  src: "/interactive/interactive.html", baseUrl, token, rundownId, itemId, role:"control", chrome:"min",
});
view.on("airz:valueChanged", m => console.log(m.key, m.value, m.origin));
view.setField("Header Text", "LIVE");
view.fireTrigger("Animate In trigger");
```

---

## Controller hand-off spec (#3 / #4 — Dart side)

The page and helper are done; hosting them is controller work:

**1. Serve the assets** (same pattern as the vendored `rive.js`): expose under `/interactive/`
- `interactive.html`, `embed.js`, and the SDK global `airz-sdk.global.min.js` (copy from `sdk/dist/`).
- The page already points the Rive runtime at `/rundown/rive.js` + `/rundown/rive.wasm`.

**2. Routes**
- `GET /interactive/:rundownId/:itemId` → serve `interactive.html`, injecting a config script **before** it:
  ```html
  <script>window.__AIRZ__ = { baseUrl: location.origin, token: "<session-token>",
    rundownId: 12, itemId: 340, role: "control", sdkUrl: "/interactive/airz-sdk.global.min.js" };</script>
  ```
- `GET /interactive/template/:templateId` → same, with `templateId` instead of `rundownId/itemId` (sandbox).
- **Auth:** the SDK uses a bearer token, so inject one (mint a token from the viewer's session into `__AIRZ__.token`). Same-origin means no CORS.

**3. Item-Config panel** — replace the bespoke preview with an iframe to
`/interactive/:rundownId/:itemId?chrome=min` and drive it via `embed.js` (or just display it).
Because it points at the same item state, the panel, the presenter link, and program stay in sync automatically.

**4. "Web Host" (template detail)** — a menu action that mints a **signed, expiring,
per-item** token and produces a shareable link:
`/interactive/:rundownId/:itemId?t=<signed>&role=control` (a presenter) or `&role=view` (a director).
Set `frame-ancestors` / framing headers to allow the app origins that embed it.

**Authoring rule:** only values the `.riv` exposes as **bound view-model properties**
(and triggers) round-trip. Interactive knobs (drag position, toggles) must be authored as
data-bound VM properties for the two-way sync to see them.
