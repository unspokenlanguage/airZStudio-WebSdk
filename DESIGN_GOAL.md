# airZ Studio HTML/JS Web Plugin — Design Goal

## What this is

A **client-side integration package** for building customer-specific HTML/JS
control apps that drive airZ Studio broadcast graphics over the LAN — by pushing
data into a playlist item's **data-binding properties** through the controller's
existing ENPS-style Rundown API (`http://<controller>:3467/api/v1`).

It generalizes the pattern already proven by the built-in journalist client
(`/rundown`, served from `RundownWebClient` inside the controller binary) into a
reusable SDK + reference app that lives **outside** the controller. Customers
build their own apps (election desk, sports scoring, finance ticker, awards
show) and hot-swap them without ever shipping a new controller release.

## The problem it solves

Today, a bespoke data-entry surface for a customer means editing the 1900-line
raw-string SPA baked into `lib/services/api/rundown_web_client.dart` and cutting
a new controller build. That does not scale to per-customer integrations.

Because the Rundown API already exposes everything an external app needs, the
control surface does **not** need to live in the controller:

- **CORS** is wide open (`Access-Control-Allow-Origin: *`) on `/api/v1`.
- **Auth** is a bearer token from `POST /api/v1/auth/login`, with server-side
  roles (superadmin, admin, producer, operator, journalist, readonly, graphics,
  breakingnews).
- **Binding schemas are discoverable** via `GET /api/v1/templates/<id>`
  (`dataBindings: { key: { type, value } }`).
- **Writes are typed** by the controller: `PATCH /api/v1/rundowns/<id>/items/<itemId>/data`
  hot-applies to the live preview/program via `PlaylistEventBus`.
- **Live inbound** is an SSE stream: `GET /api/v1/stream?token=&rundownId=`.

## Scope decisions (locked)

- **Hosting:** customer apps are hosted **separately** (any LAN box / the
  customer's own host) and simply hit `http://<controller>:3467/api/v1`. No
  controller-side static route is in scope. No change to `WebServerService`.
- **Reference framework:** **React** for the reference app. The SDK itself is
  framework-agnostic (works with Svelte/Vue/vanilla too).
- **Not in scope:** rendering HTML on-air. The on-air graphic remains the
  playlist item's own template (Rive, etc.); these apps are the **data/control
  surface** that feeds it. No WebView2 / compositor / widget-overlay involvement.

## Architecture

```
┌────────────────────────┐   pull (customer's domain)   ┌──────────────────┐
│  Customer data source  │ ───────────────────────────► │  Customer HTML/JS │
│  (election feed, CSV,   │                              │  app (React)      │
│   sheet, scoreboard…)   │                              │  + @airz/rundown  │
└────────────────────────┘                              └───────┬──────────┘
                                                                │ push (REST) + sync (SSE)
                                                                ▼
                                          http://<controller>:3467/api/v1
                                                                │
                                                                ▼
                              PATCH items/<id>/data → PlaylistEventBus → engine
                                          → live preview / program output
```

The SDK owns the **airZ side** (auth, push, trigger, live sync, diffing). The
customer owns the **pull side** (whatever their source is). A declarative
mapping layer bridges the two.

## Package layout

- `sdk/` — `@airz/rundown-sdk`: framework-agnostic TypeScript client.
  - `createClient({ baseUrl, token })` — fetch wrapper + auth.
  - `rundowns`, `items`, `templates` resource namespaces.
  - `items.setData()` — the core push (`PATCH .../data`).
  - `items.trigger()` — `POST .../trigger` (operator role).
  - `client.stream()` — typed SSE with auto-reconnect.
  - `createBindingSync()` — diffs against last-pushed values and PATCHes only
    what changed, so the engine is not hammered with redundant hot-applies.
- `examples/election-desk/` — React + Vite reference app: rows of parties →
  item bindings, live push, on-air trigger, SSE-reflected state.

## Data contract (from the controller source)

- **Item** (`_itemJson`): `{ id, rundownId, order, groupId, title, templateId,
  type, durationMs, enabled, status, lockedBy, data }` — `data` is the flat
  binding map.
- **Template** (`_templateDetailJson`): `{ id, name, category, dataBindings,
  triggers, defaultValues, ... }`; `dataBindings[key].type ∈ text | string |
  number | color | image | trigger | action`.
- **Write** (`PATCH .../items/<id>/data`): body `{ data: {...} }`. Values may be
  bare (`{ "Party A": 120 }`, server infers type from the template) or explicit
  (`{ "Party A": { type: "number", value: 120 } }`). `trigger`-typed keys are
  ignored on data writes — fire them via the trigger endpoint.
- **SSE events** (dotted names — the `api_reference.md` underscore names are
  stale): `hello`, `rundown.created|updated|deleted|changed`,
  `item.created|updated|deleted|reordered|trigger|editing`, `group.*`,
  `asset.*`, `lock.changed`, `presence.update`, plus `: keepalive` comments.

## Roadmap

- **P1 (this scaffold):** SDK (auth, items, `setData` w/ diff, trigger, SSE) +
  React election-desk example.
- **P2:** data-source mapping layer — poller/webhook adapters + declarative
  `source field → item binding` map + batched diffed writes.
- **P3:** hardening — reconnect/backoff, optimistic UI + SSE reconciliation,
  soft-lock/presence helpers, publishable npm build, typed error surface.
