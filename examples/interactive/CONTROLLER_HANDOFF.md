# Controller hand-off — host & embed the interactive preview

**Audience:** the engineer who owns `RiveAnimationClient` (Dart/Flutter controller).
**Goal:** serve the web-SDK `interactive.html` from the controller and embed it where
the item's Rive bindings are edited, so the panel, external presenter links, and
program all share one two-way preview. Nothing about Rive rendering or the two-way
engine needs to be re-implemented — it all lives in `interactive.html`.

The page + embed helper are done and committed in `examples/interactive/`
(`interactive.html`, `embed.js`, `README.md`). This doc is the controller side.

---

## 0. Why this is small
The controller already does every hard part:
- Serves a bundled Rive runtime at `/rundown/rive.js` + `/rundown/rive.wasm`
  (`web_server_service.dart:86-89`, `_serveBundledAsset`). `interactive.html` points
  at exactly those paths.
- Has a working web preview client at `/rundown` (`RundownWebClient.handler`,
  `web_server_service.dart:81`). `interactive.html` uses the identical Rive load
  pattern lifted from `rundown_web_client.dart` (paused load → reload with
  `stateMachines: sm[0]` → fire first trigger).
- Issues bearer tokens via `POST /api/v1/auth/login`.
- Broadcasts `item.updated` / `item.trigger` over `GET /api/v1/stream` (SSE), which
  the page already consumes.

So this is: **serve 3 files, add 2 routes with a token injected, embed one iframe.**

---

## 1. Vendor the assets (like `rive.js`)
Copy into the app bundle under `assets/interactive/`:
- `interactive.html`  (from `examples/interactive/`)
- `embed.js`
- `airz-sdk.global.min.js`  (from `sdk/dist/` after `npm run build` in the web SDK)

Serve them, mirroring the existing `_serveBundledAsset` routes:
```dart
routerFull.get('/interactive/embed.js',
    (r) => _serveBundledAsset('assets/interactive/embed.js', 'application/javascript'));
routerFull.get('/interactive/airz-sdk.global.min.js',
    (r) => _serveBundledAsset('assets/interactive/airz-sdk.global.min.js', 'application/javascript'));
```
(The page keeps using `/rundown/rive.js` + `/rundown/rive.wasm` — no new runtime copy.)

## 2. The two page routes (with `__AIRZ__` injected)
`interactive.html` resolves its target + auth from `window.__AIRZ__` first. Inject it by
replacing the placeholder comment already in the file:

```html
<!-- AIRZ_CONFIG -->
```

Handler sketch (same-origin → no CORS; the injected token is what the page uses):
```dart
Future<Response> _serveInteractive(Request req, {int? rundownId, int? itemId, int? templateId}) async {
  final html = await _bundledString('assets/interactive/interactive.html');
  final token = _issueSessionToken(req);            // see §3
  final cfg = {
    'baseUrl': '',                                  // '' → page falls back to location.origin
    'token': token,
    if (rundownId != null) 'rundownId': rundownId,
    if (itemId != null)    'itemId': itemId,
    if (templateId != null)'templateId': templateId,
    'role': _roleFor(req),                           // 'control' | 'view'
    'sdkUrl': '/interactive/airz-sdk.global.min.js',
  };
  final injected = html.replaceFirst('<!-- AIRZ_CONFIG -->',
      '<script>window.__AIRZ__=${jsonEncode(cfg)}</script>');
  return Response.ok(injected, headers: {'content-type': 'text/html; charset=utf-8', ...});
}

routerFull.get('/interactive/<rid|[0-9]+>/<iid|[0-9]+>',
    (r, rid, iid) => _serveInteractive(r, rundownId: int.parse(rid), itemId: int.parse(iid)));
routerFull.get('/interactive/template/<tid|[0-9]+>',
    (r, tid) => _serveInteractive(r, templateId: int.parse(tid)));   // design sandbox, no program impact
```

**Important:** `location.origin` must be the API origin. When the page is at
`http://host:3467/interactive/…`, `baseUrl:''` makes it use `http://host:3467` and the
SDK appends `/api/v1`. Good.

## 3. Auth / token
`interactive.html` (and the SDK) authenticate with a **bearer token** — the same kind
`POST /api/v1/auth/login` returns. Two cases:
- **Internal (panel, local presenter):** mint a short-lived token bound to the viewer's
  controller session and inject it into `__AIRZ__.token` (`_issueSessionToken`). No login
  UI appears.
- **External "Web Host" link (§5):** a signed, expiring token in the URL (`?t=…`), which
  the page already reads.

If you'd rather not inject a token, the page falls back to its own sign-in gate — but
injection is the clean path for embedded use.

## 4. Embed it where bindings are edited (the core of "bidirectional in the controller")
Replace the bespoke preview in the item-binding editor with the hosted page. The
embedding surface is your choice:
- **`/rundown` web client** → an `<iframe>` + `embed.js`.
- **Flutter desktop panel** → a webview widget pointed at the same URL; drive it with the
  same postMessage messages.

Contract (implemented by the page — see `README.md` "Embed API"):
```
parent → frame : airz:setField {key,value} · airz:fireTrigger {name}
                 airz:setMode {mode:'cue'|'live'} · airz:setOnAir {on} · airz:reload
frame  → parent: airz:ready {bindings,item} · airz:valueChanged {key,value,origin}
                 airz:triggered {name,origin} · airz:state {air,onAir,connected} · airz:error
```
Mount it at `/interactive/:rundownId/:itemId?chrome=min` (canvas-only). Because it binds
the same item's data + SSE, the panel, any open Web Host link, and program stay in sync —
that's the bidirectional loop, achieved by pointing everything at one item's bindings.

`embed.js` usage (web surface):
```js
const view = AirzInteractive.mount("#preview", {
  src: "/interactive/interactive.html", rundownId, itemId, role: "control", chrome: "min",
}); // same-origin: no token needed here if the served page injects its own
view.on("airz:valueChanged", m => /* reflect in the panel's fields */);
view.setField("Header Text", "LIVE");
```

## 5. "Web Host" (template detail menu)
Add a menu action that produces a shareable link for someone on another machine:
- Mint a **signed, expiring, per-item** token with a role claim.
- Link: `/interactive/:rundownId/:itemId?t=<signed>&role=control` (presenter) or
  `&role=view` (director, read-only — the page disables inputs/outbound for `view`).
- For a template sandbox: `/interactive/template/:templateId?t=<signed>`.

## 6. Framing / CSP
The page is framed by the panel (and possibly the `/rundown` client). Ensure the response
allows it — set `Content-Security-Policy: frame-ancestors 'self' <app-origins>` (the file
already has CSP handling around `web_server_service.dart:307-315`; extend it for
`/interactive`). Avoid a blanket `X-Frame-Options: DENY` on these routes.

## 7. Test checklist
1. `GET /interactive/<rid>/<iid>` returns HTML with `<script>window.__AIRZ__=…</script>`
   before the SDK loader; no sign-in gate appears.
2. Page renders the item's `.riv`, auto-fires the first trigger, shows its on-state.
3. Edit a field in the panel → `airz:valueChanged` round-trips; program updates when
   live + on air.
4. Fire a trigger in the panel/controller → the framed preview animates (inbound SSE).
5. Change the item on the controller → the framed preview reflects it (no echo loop).
6. A `?t=` Web Host link opens on another machine and controls / views per role.

---

### Reference points
- Web SDK: `examples/interactive/interactive.html` (config resolution at `readConfig`,
  embed API near the `message` listener), `embed.js`, `README.md`.
- Controller: `web_server_service.dart` (`routerFull.get`, `_serveBundledAsset`, CSP),
  `rundown_web_client.dart` (the Rive load pattern this page mirrors).
