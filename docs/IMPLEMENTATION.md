# airZ Studio Web Plugin — Implementation Guide

**Audience:** engineers building LAN control apps that drive airZ Studio
broadcast graphics.
**Version:** `@airz/rundown-sdk` 0.1.0 · Rundown API `v1` (controller `:3467`)

---

## Table of contents

1. [What you are building](#1-what-you-are-building)
2. [Mental model](#2-mental-model)
3. [Prerequisites](#3-prerequisites)
4. [Install](#4-install)
5. [Quick start (60 seconds)](#5-quick-start-60-seconds)
6. [Authentication & roles](#6-authentication--roles)
7. [Discovering what you can bind to](#7-discovering-what-you-can-bind-to)
8. [Pushing data — the core operation](#8-pushing-data--the-core-operation)
9. [Efficient pushing with BindingSync](#9-efficient-pushing-with-bindingsync)
10. [Firing on-air triggers](#10-firing-on-air-triggers)
11. [Live sync over SSE](#11-live-sync-over-sse)
12. [Connecting a real data source (the "pull" side)](#12-connecting-a-real-data-source-the-pull-side)
13. [Worked example: Election Desk](#13-worked-example-election-desk)
14. [SDK API reference](#14-sdk-api-reference)
15. [Error handling](#15-error-handling)
16. [Deployment & hosting](#16-deployment--hosting)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. What you are building

A **control surface**: a web app that reads data from _your_ source (an election
feed, a scoreboard, a spreadsheet, an operator typing) and writes it into a
**playlist item's data bindings** on an airZ Studio controller. The controller
hot-applies each write to the live preview and program output.

You are **not** building the on-air graphic. The graphic is the playlist item's
own template (Rive, etc.), authored elsewhere. Your app supplies its live data.

```
your data ──▶ your web app (+ @airz/rundown-sdk) ──▶ POST/PATCH /api/v1 ──▶ controller ──▶ air
                                    ▲                                            │
                                    └──────────────── SSE /stream ◀─────────────┘
```

The app is hosted **separately** from the controller (any LAN machine) and
reaches it at `http://<controller-ip>:3467/api/v1`. CORS is open, so no proxy is
required.

---

## 2. Mental model

| Term | API concept | Meaning |
|------|-------------|---------|
| **Rundown** | Playlist | An ordered show — a container of items. |
| **Item** | PlaylistItem | One graphic in the show; owns a `templateId` and a `data` map. |
| **Binding** | `dataBindings[key]` | A named, typed input on the item's template (`text`, `number`, `color`, `image`, `trigger`). |
| **Data push** | `PATCH .../items/<id>/data` | Set binding **values**; hot-applies live. |
| **Trigger** | `POST .../items/<id>/trigger` | Fire a state-machine action (e.g. `Animate-In`). Operator only. |
| **Stream** | `GET /stream` (SSE) | One-way live push of every change back to your app. |

**Golden rule:** you write binding _values_; the graphic decides how to display
them. Keep your app about data, not presentation.

---

## 3. Prerequisites

- Node.js ≥ 18 (fetch/EventSource are used natively in the browser).
- A reachable controller with the **Rundown Server enabled** (Settings → Rundown
  API) so it binds the LAN, not just loopback.
- A user account + role. For a data-entry desk, `journalist` can edit data;
  firing on-air triggers requires `operator`. See §6.

Verify the controller is reachable:

```bash
curl http://<controller-ip>:3467/api/v1/
# → { "name": "airZ Studio Rundown API", "version": "v1", ... }
```

---

## 4. Install

Inside this repo the SDK is a workspace; from an external app install it from
your registry (or `npm link` during development):

```bash
npm install @airz/rundown-sdk
```

The SDK ships ESM + type declarations and has **zero runtime dependencies**.

---

## 5. Quick start (60 seconds)

```ts
import { createClient } from "@airz/rundown-sdk";

const client = createClient({ baseUrl: "http://192.168.1.50:3467" });

// 1. Authenticate.
await client.auth.login("desk-op", "••••••");

// 2. Find a rundown and an item to drive.
const [rundown] = await client.rundowns.list();
const items = await client.items.list(rundown.id);
const item = items[0];

// 3. Push binding values — this appears on-air immediately.
await client.items.setData(rundown.id, item.id, {
  "Headline": "LIVE RESULTS",
  "Party A Votes": 1200,
});

// 4. Fire an on-air animation (requires operator role).
await client.items.trigger(rundown.id, item.id, "Animate-In");
```

---

## 6. Authentication & roles

`login()` exchanges credentials for a bearer token and stores it on the client;
every later call is authenticated automatically.

```ts
const session = await client.auth.login("desk-op", "secret");
console.log(session.user.role); // "journalist"

// Reuse a token later (e.g. from storage) without logging in again:
const c2 = createClient({ baseUrl, token: session.token });
```

**Role capabilities that matter for control apps:**

| Role | Edit item data (`setData`) | Fire triggers (`trigger`) |
|------|:--:|:--:|
| `operator` | ✕ (read-only view) | ✓ |
| `journalist` | ✓ | ✕ |
| `producer` | ✓ | ✕ |
| `admin` / `superadmin` | ✓ | ✓ |

> A desk that both edits data **and** fires on-air animations needs `operator`
> (or admin). If you separate concerns, one journalist app edits values and one
> operator app fires triggers — both hit the same item.

Handle expiry by catching `401` and re-logging in (see §15).

---

## 7. Discovering what you can bind to

Binding keys are defined by the item's **template**. Fetch the template to read
its typed schema, then bind against those exact keys.

```ts
const item = items[0];
if (item.templateId != null) {
  const tpl = await client.templates.get(item.templateId);
  for (const [key, schema] of Object.entries(tpl.dataBindings)) {
    console.log(key, schema.type); // "Party A Votes" number, "Logo" image, ...
  }
}
```

Binding `type` values: `text` | `string` | `number` | `color` | `image` |
`trigger` | `action`. Use this to render the right input (a color picker for
`color`, a number field for `number`) and to validate before pushing.

> `image` bindings expect a path/URL the controller can resolve. On a local-mode
> controller, absolute local paths are auto-relayed; otherwise pass a URL.

---

## 8. Pushing data — the core operation

`setData` maps to `PATCH /rundowns/<id>/items/<id>/data`. Values can be **bare**
(the controller infers the type from the template) or **explicit**:

```ts
// Bare — simplest; server types each key from the template.
await client.items.setData(rundownId, itemId, {
  "Headline": "BREAKING",
  "Party A Votes": 1200,
  "Accent": "#e11d48",
});

// Explicit — when there is no template, or to be unambiguous.
await client.items.setData(rundownId, itemId, {
  "Party A Votes": { type: "number", value: 1200 },
});
```

Notes:

- Only send the keys you want to change; unspecified bindings are untouched.
- Keys typed `trigger` are **ignored** here — fire them via §10.
- Every push hot-applies to preview and program if the item is live.

---

## 9. Efficient pushing with BindingSync

A polling data source recomputes the full value set on every tick. Sending all
of it each time floods the engine with redundant hot-applies. `BindingSync`
**diffs against the last sent values** and PATCHes only what changed, with
optional debouncing.

```ts
const sync = client.items.bindingSync({
  rundownId,
  itemId,
  debounceMs: 150,                     // coalesce bursts into one PATCH
  onFlush: (changed) => console.log("sent", Object.keys(changed)),
  onError: (e) => console.error(e),
});

// Seed the baseline from the item's current on-air values so the first
// diff is real, not against an empty map.
sync.prime(item.data);

// Call as often as you like — only changes go over the wire.
sync.set({ "Party A Votes": 1200 });
sync.set({ "Party A Votes": 1200 });   // no-op: unchanged
sync.set({ "Party B Votes": 980 });    // one PATCH with just Party B

await sync.flush();                     // force an immediate write if needed
```

Guarantees:

- Writes are **serialized** — an in-flight PATCH completes before the next, so
  out-of-order responses can't resurrect stale values.
- Failed keys are **re-queued** (unless a newer value already superseded them).

---

## 10. Firing on-air triggers

Triggers run a state-machine action on the live engine (e.g. animate in/out).
They bypass data writes and require the `operator` (or `breakingnews`/admin)
role.

```ts
await client.items.trigger(rundownId, itemId, "Animate-In");
// ...later
await client.items.trigger(rundownId, itemId, "Animate-Out");
```

Discover valid trigger names from the template: `dataBindings` keys whose
`type === "trigger"`, or the `triggers` array on `templates.get()`.

---

## 11. Live sync over SSE

Open a stream to reflect changes made by the controller UI, other apps, or your
own writes. `client.stream()` wraps `EventSource`, auto-reconnects with backoff,
and delivers typed events.

```ts
const stream = client.stream({
  rundownId,                    // omit to receive events for all rundowns
  onOpen: () => setStatus("connected"),
  onError: () => setStatus("reconnecting"),
});

// Subscribe to a specific event…
stream.on("item.updated", (ev) => {
  if (ev.data.itemId === itemId) refreshItem();
});

// …or to everything.
const off = stream.on("*", (ev) => console.log(ev.event, ev.data));

// Later:
off();
stream.close();
```

Event names (dotted): `hello`, `rundown.created|updated|deleted|changed`,
`item.created|updated|deleted|reordered|trigger|editing`,
`group.*`, `asset.*`, `lock.changed`, `presence.update`.

**Reconciliation pattern** — apply your write optimistically, then let the
matching `item.updated` confirm (or a re-fetch correct) it:

```ts
sync.set({ "Party A Votes": next });          // optimistic
stream.on("item.updated", (ev) => {
  if (ev.data.itemId === itemId) pullLatest(); // authoritative
});
```

---

## 12. Connecting a real data source (the "pull" side)

The SDK owns the airZ side. Your source is arbitrary — a poller is the common
shape. Map source fields to binding keys, then feed a `BindingSync`.

```ts
// Declarative map: source field → item binding key.
const MAP: Record<string, string> = {
  "results.partyA.votes": "Party A Votes",
  "results.partyB.votes": "Party B Votes",
  "meta.headline": "Headline",
};

const sync = client.items.bindingSync({ rundownId, itemId, debounceMs: 200 });

async function tick() {
  const feed = await fetch("https://feed.internal/election").then((r) => r.json());
  const next: Record<string, unknown> = {};
  for (const [srcPath, binding] of Object.entries(MAP)) {
    next[binding] = srcPath.split(".").reduce<any>((o, k) => o?.[k], feed);
  }
  sync.set(next); // diffing means steady state produces zero network traffic
}

setInterval(tick, 2000);
```

This is the seed of the P2 "mapping layer"; for now a dozen lines gives you a
live feed → on-air pipeline.

---

## 13. Worked example: Election Desk

The `examples/election-desk` React app implements the full flow: login → pick
rundown/item → type vote counts (pushed via `BindingSync`) → fire an on-air
trigger → watch a live SSE feed.

Run it against your controller:

```bash
# from the repo root
npm install
npm run build:sdk
npm run dev:election
# open the printed URL, set the Controller URL to http://<controller-ip>:3467
```

Key wiring (see `examples/election-desk/src/App.tsx`):

```ts
// One diffing writer for the chosen item.
const sync = client.items.bindingSync({ rundownId, itemId, debounceMs: 120 });
sync.prime(target.data);

// Each number input pushes just its own binding.
const setVote = (party, value) => sync.set({ [party.binding]: value });

// Operator action.
const fire = () => client.items.trigger(rundownId, itemId, "Animate-In");
```

Adjust the party→binding map in `src/config.ts` to match your template's actual
`dataBindings` keys (confirm them via §7).

---

## 14. SDK API reference

### `createClient(options) → AirzClient`

| Option | Type | Notes |
|--------|------|-------|
| `baseUrl` | `string` | `http://host:3467` or `http://host:3467/api/v1` (both accepted). |
| `token` | `string?` | Skip login by supplying an existing token. |

### `client.auth`

- `login(username, password) → Promise<Session>` — stores the token.
- `logout() → Promise<void>` — revokes + clears the token.
- `me() → Promise<{ user }>`

### `client.rundowns`

- `list(filters?) → Promise<Rundown[]>` — `{ status?, channel? }`.
- `get(id) → Promise<RundownDetail>` — items, groups, presence, locks.
- `create(input) → Promise<Rundown>`

### `client.items`

- `list(rundownId) → Promise<RundownItem[]>`
- `setData(rundownId, itemId, data) → Promise<RundownItem>` — the core push.
- `trigger(rundownId, itemId, name) → Promise<void>` — operator only.
- `update(rundownId, itemId, updates) → Promise<RundownItem>` — metadata.
- `bindingSync(options) → BindingSync` — diffing writer (§9).

### `client.templates`

- `list(query?) → Promise<TemplateSummary[]>`
- `get(id) → Promise<TemplateDetail>` — includes `dataBindings` schema.

### `client.stream(options) → RundownStream`

- `.on(name | "*", cb) → () => void`
- `.close()`

### `BindingSync`

- `.prime(current)` — seed the baseline (no network).
- `.set(partial)` — merge desired values; schedules a diffed flush.
- `.flush() → Promise<void>` — force an immediate write.

### Errors

- `ApiError { status, message, body }` — thrown for non-2xx responses.

---

## 15. Error handling

```ts
import { ApiError } from "@airz/rundown-sdk";

try {
  await client.items.setData(rundownId, itemId, { "Headline": text });
} catch (e) {
  if (e instanceof ApiError) {
    if (e.status === 401) await reauthenticate();      // token expired
    else if (e.status === 403) notify("insufficient role");
    else if (e.status === 423) notify(`item locked by ${(e.body as any)?.lockedBy}`);
    else notify(e.message);
  } else {
    throw e; // network/unknown
  }
}
```

Common statuses: `401` unauthorized (log in again), `403` role denied, `404`
gone, `423` item soft-locked by another editor.

---

## 16. Deployment & hosting

- Host the built app on any LAN machine (nginx, `vite preview`, a static host).
- Point it at the controller with a runtime-configurable `baseUrl` — never
  hard-code an IP into the bundle; read it from a field or `?controller=` param.
- Keep it on the studio LAN. The Rundown API is designed for a closed broadcast
  network and should not be exposed to the internet.
- Because auth is a bearer token, prefer a per-app service account with the
  **minimum role** the app needs.

---

## 17. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Failed to fetch` / CORS | Controller unreachable or Rundown Server bound to loopback | Enable the Rundown Server; confirm `curl :3467/api/v1/`. |
| `401 Unauthorized` | No/expired token | `auth.login()` again; reuse `session.token`. |
| `403 Forbidden` on `trigger` | Not an operator | Use an operator account for on-air actions. |
| Data push returns 200 but nothing on air | Item not live, or wrong binding key | Confirm the item is on program; verify keys via `templates.get()`. |
| SSE never connects | Token missing on the URL | Use `client.stream()` (it appends the token) rather than a raw `EventSource`. |
| Values flicker/revert | Racing full-map writes | Use `BindingSync` (diffs + serializes) instead of raw `setData` loops. |

---

*Built on the airZ Studio Rundown API (`lib/services/api/rundown_api.dart`).
This SDK is a thin, typed client over that surface — anything the API can do,
you can do here.*
