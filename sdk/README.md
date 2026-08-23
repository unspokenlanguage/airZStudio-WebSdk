# @airz/rundown-sdk

The official TypeScript SDK for building **LAN control apps** against an airZ Studio
controller. Write a web app — a results desk, a lower-third controller, a scoreboard,
an election panel — that reads a controller's rundowns and templates and **pushes data
onto broadcast graphics** over the Rundown API (`http://<controller>:3467/api/v1`).

It works in the browser and in Node, ships full types, and has **zero runtime
dependencies**.

> New here? Read [Mental model](#2-mental-model) then [Quick start](#4-quick-start).
> Building a real panel? The section that matters most is **[The air model](#9-the-air-model-cue-live--liveFields)** — it's what makes graphics reach air correctly.

---

## Table of contents

1. [Install](#1-install)
2. [Mental model](#2-mental-model)
3. [Concepts & glossary](#3-concepts--glossary)
4. [Quick start](#4-quick-start)
5. [Connecting: `AirzClient` & auth](#5-connecting-airzclient--auth)
6. [Reading: rundowns, items, templates, assets](#6-reading-rundowns-items-templates-assets)
7. [Writing data: `setData` & `BindingSync`](#7-writing-data-setdata--bindingsync)
8. [`PanelBinder`: many panels from one data source](#8-panelbinder-many-panels-from-one-data-source)
9. [The air model: cue, live & `liveFields`](#9-the-air-model-cue-live--liveFields)
10. [Value types, coercion & formatting](#10-value-types-coercion--formatting)
11. [Images & assets](#11-images--assets)
12. [Configuration: `MappingConfig` & the Configurator](#12-configuration-mappingconfig--the-configurator)
13. [Cross-machine config sync](#13-cross-machine-config-sync)
14. [Realtime: streaming, mirror, presence, locks](#14-realtime-streaming-mirror-presence-locks)
15. [`LinkedItem`: two-way control](#15-linkeditem-two-way-control)
16. [Full worked example: an election desk](#16-full-worked-example-an-election-desk)
17. [Error handling](#17-error-handling)
18. [Troubleshooting](#18-troubleshooting)
19. [API reference](#19-api-reference)

---

## 1. Install

```bash
npm install @airz/rundown-sdk
```

ESM-only, targets modern browsers and Node 18+. Import what you need:

```ts
import { createClient, PanelBinder, image } from "@airz/rundown-sdk";
```

The controller must have its **Rundown API (LAN) toggle** enabled. It listens on
`:3467`; the API base is `http://<controller-ip>:3467/api/v1`.

---

## 2. Mental model

An airZ Studio controller runs the broadcast. Your app never renders graphics — it
**feeds data** to graphics the controller renders. Three nouns:

| Rundown API term | What it is |
| --- | --- |
| **Rundown** | An ordered list of items (a "playlist" / running order). |
| **Item** | One entry in a rundown, usually backed by a **template**. Holds the current binding **overrides** (`data`). |
| **Template** | A Rive/graphic with a **data-binding schema** — the named properties you can drive (`dataBindings`). |

Your app's job, every time fresh data arrives:

```
your data  ──map──▶  { bindingKey: value, … }  ──PATCH──▶  item.data  ──▶ graphic on air
```

Plus **triggers** — named state-machine cues (`VER`, `ALL`, `SHOW`, `OUT`) that make
the graphic animate in/out. Data says *what*; triggers say *now*.

Two orthogonal switches decide whether a change reaches the **program output** or only
the **controller preview** — see [The air model](#9-the-air-model-cue-live--liveFields).

---

## 3. Concepts & glossary

- **Binding / binding key** — a named property on a template (`party_1_perc`, `Headline`,
  `home_logo`). You push values keyed by these.
- **Binding value** — either a **bare** value (`"18.5"`, `42`) or an explicit
  `{ type, value }` pair. The controller infers the type from the template when bare.
- **Override (`item.data`)** — the map of current values stored on an item.
- **Trigger** — a binding whose type is `trigger`/`action`; firing it runs the graphic's
  animation. You don't PATCH triggers as data — you `trigger()` them.
- **Preview vs Program** — the controller shows a **preview** (rehearsal) and outputs a
  **program** feed (on air). Staged writes touch only preview.
- **On air** — an item currently composited to program (taken via a trigger or the
  controller's TAKE). Live data only reaches program for on-air items.
- **Roles** — the controller enforces roles (`operator`, `admin`, `graphics`,
  `journalist`, `readonly`, …). Pushing **live** data or firing triggers requires an
  operator-class role; a read-only/journalist token can still stage.

---

## 4. Quick start

```ts
import { createClient } from "@airz/rundown-sdk";

// 1. Connect
const client = createClient({ baseUrl: "http://192.168.1.50:3467/api/v1" });
await client.auth.login("operator", "••••••");

// 2. Find something to drive
const rundowns = await client.rundowns.list();
const items = await client.items.list(rundowns[0].id);
const item = items[0];

// 3. Inspect the template's bindable properties
const tpl = await client.templates.get(item.templateId!);
console.log(Object.keys(tpl.dataBindings)); // ["Headline", "party_1_perc", …]

// 4. Push data
await client.items.setData(rundowns[0].id, item.id, {
  Headline: "ELECTION NIGHT",
  party_1_perc: "23.5",
});

// 5. Fire a trigger to bring it on air
await client.items.trigger(rundowns[0].id, item.id, "SHOW");
```

That's the raw API. For anything real, use [`PanelBinder`](#8-panelbinder-many-panels-from-one-data-source),
which diffs, batches, resolves images, and applies the [air model](#9-the-air-model-cue-live--liveFields).

---

## 5. Connecting: `AirzClient` & auth

```ts
import { createClient, AirzClient } from "@airz/rundown-sdk";

const client = createClient({
  baseUrl: "http://192.168.1.50:3467/api/v1", // or bare "http://192.168.1.50:3467"
  token: existingToken,                        // optional — skip login
});
```

`baseUrl` accepts a bare origin; `/api/v1` is appended automatically.

```ts
const session = await client.auth.login("operator", "password");
session.token;            // stored on the client automatically
session.user.role;        // "operator"

client.getToken();        // current bearer token
client.setToken(token);   // swap it (also retargets streams)
await client.auth.me();   // { user }
await client.auth.logout();
```

The client exposes six resource namespaces plus a stream factory:
`client.auth`, `client.rundowns`, `client.items`, `client.templates`,
`client.assets`, `client.webConfigs`, and `client.stream(...)`.

---

## 6. Reading: rundowns, items, templates, assets

```ts
// Rundowns
await client.rundowns.list({ status: "onair" });   // filter optional
await client.rundowns.get(rundownId);              // full detail: items, groups, presence, locks
await client.rundowns.create({ name: "Election Night", channel: "1" });

// Items
await client.items.list(rundownId);                // RundownItem[]
await client.items.get(rundownId, itemId);         // one item (lists + finds)
await client.items.create(rundownId, { title: "Lower third", templateId });

// Templates — the binding schema you map against
const tpl = await client.templates.get(templateId);
tpl.dataBindings;  // { key: { type: "string" | "number" | "image" | "trigger" | … } }
tpl.triggers;      // available trigger names
await client.templates.list({ category: "Election" });

// Assets (images/media managed by the controller)
await client.assets.list({ folder: "/Election", type: "image" });
```

Read the template schema to know which keys exist and their types — that's what you bind to.

---

## 7. Writing data: `setData` & `BindingSync`

### `setData` — the raw push

```ts
await client.items.setData(rundownId, itemId, {
  party_1_perc: "23.5",                          // bare — type inferred from template
  turnout: { type: "number", value: 71.3 },      // explicit
}, { mode: "staged" });                          // optional; omit for live
```

- **`mode: "staged"`** → the value lands in a **preview-only** buffer. It never reaches
  program until promoted.
- **omit `mode`** → a **live** write: reaches program **if the item is on air** (and your
  role may push). Not on air → updates preview only.

### `BindingSync` — the diffing writer (recommended for streams)

Sending a full map on every tick hammers the engine with redundant applies. `BindingSync`
diffs against the last push and PATCHes only what changed, with optional debouncing.

```ts
const sync = client.items.bindingSync({ rundownId, itemId, debounceMs: 100 });

sync.prime(item.data);       // seed the baseline from current on-air values (no send)
sync.set({ party_1_perc: "23.5" });   // schedules a diffed flush
sync.set({ party_1_perc: "23.7" });   // coalesced
await sync.flush();          // force-send now; resolves when the write settles
sync.setMode("staged");      // retarget subsequent flushes (live ↔ staged)
```

Writes are serialized internally, so an out-of-order PATCH can't resurrect a stale value.
Failed keys are re-queued unless a newer value already superseded them.

### Triggers

```ts
await client.items.trigger(rundownId, itemId, "SHOW");                     // live → program
await client.items.trigger(rundownId, itemId, "SHOW", { mode: "staged" }); // preview only
await client.items.trigger(rundownId, itemId, "SHOW", { flushStaged: true }); // promote staged data + fire
await client.items.pushStaged(rundownId, itemId);                          // promote staged data → live (no fire)
```

---

## 8. `PanelBinder`: many panels from one data source

A real control app drives several graphics ("panels") from one document (a feed, a store).
`PanelBinder` maps each panel from that document, resolves images, diff-pushes per item, and
applies the [air model](#9-the-air-model-cue-live--liveFields).

```ts
import { PanelBinder } from "@airz/rundown-sdk";

const binder = new PanelBinder(client, { images: linkingImages(client, { folder: "/Election" }) });

binder.add({
  name: "scoreboard",                          // stable id
  target: { rundownId, itemId },               // which controller item
  fields: [
    { to: "home_name", from: "home.name" },    // binding ← source path
    { to: "home_score", from: "home.score", type: "number" },
    { to: "home_logo", from: "home.logo", image: true },
  ],
  repeats: [                                    // fan a list into indexed bindings
    { from: "topParties", limit: 5, as: (p, i) => ({
        [`party_${i+1}_name`]: p.name,
        [`party_${i+1}_perc`]: p.percent,
    }) },
  ],
});

// Every time fresh data arrives:
await binder.update(sourceDocument);     // recomputes + pushes all panels
await binder.updateOne("scoreboard", sourceDocument);  // just one
```

Field options: `from` (dotted source path or a function), `type`, `transform(v, slice)`,
`image: true`. Use `select` on a panel to slice the source first
(`select: (s) => s.regions[activeId]`).

---

## 9. The air model: cue, live & `liveFields`

This is the heart of the SDK. **Two independent axes** decide where a change goes.

### Axis A — on-air state (global): `setOnAir(boolean)`

The operator's **Rehearse ↔ On-Air** switch. While `false`, *everything* stays on the
preview — a hard safety net.

```ts
binder.setOnAir(true);   // On-Air
binder.setOnAir(false);  // Rehearse — nothing reaches program
```

### Axis B — per-panel policy: `air: "cue" | "live"`

- **`cue`** (default) — selecting/updating **prepares** data (preview only). It reaches
  program only when you **`take()`** it: the full prepared set is flushed *with* the
  trigger, so the graphic animates in carrying the latest values. Use for full-screen
  graphics you cue then take.
- **`live`** — once the panel has been taken on air, data **streams** to program on every
  update (e.g. a results ticker whose numbers climb on air). Until its first trigger it
  stays in preview.

```ts
binder.add({ name: "ticker",     target: t1, air: "live", fields: [...] });
binder.add({ name: "fullscreen", target: t2, air: "cue",  fields: [...] }); // cue is default
```

### The decision matrix

| | Rehearse (`onAir=false`) | On-Air — `cue` panel | On-Air — `live` panel |
| --- | --- | --- | --- |
| **`update()` (data)** | → preview only | → preview only (cued) | → **program** + preview (streams) |
| **`take()` (trigger)** | fire on preview | **flush full data + fire → program** | fire on program (data already flowing) |

### Committing to air

```ts
// Cue panel: flush the full prepared data + fire the trigger (the "take").
// While rehearsing this fires on preview only. Live panel: just fires.
await binder.take("fullscreen", "SHOW");

// Plain fire — live panels (ticker loop advance) or generic triggers.
await binder.fire("ticker", "NEXT");
```

### Per-field override: `liveFields`

Inside a `cue` panel, flag individual keys to **stream live** while the rest waits — e.g. a
`turnout%` that ticks on air while the fullscreen body stays cued:

```ts
binder.add({
  name: "fullscreen",
  target: t2,
  air: "cue",
  liveFields: ["turnout"],   // this key streams; everything else is cued
  fields: [...],
});
```

Behind the scenes a second diffing sync carries just the `liveFields` subset at live mode
while the rest follows the panel policy. (Ignored on a `live` panel — everything streams.)

### Why "hold until first trigger" for live panels

A `live` panel's data goes to the live buffer immediately, but the controller only pushes
it to **program** once the item is actually on air. So a ticker sits in preview until you
take it on air once (its trigger, or the controller's TAKE); after that, every update
streams. This prevents half-prepared values flashing on program.

---

## 10. Value types, coercion & formatting

Push bare values and let the controller infer types from the template, or be explicit with
`{ type, value }`. The controller coerces to the binding's declared type:

- `number` binding ← a numeric string is parsed (`"23.5"` → `23.5`).
- `string` binding ← a number is stringified.
- `boolean` ← `true` / `"true"`.
- `color` ← `#RRGGBB` / `#AARRGGBB`.
- `image` ← a controller-resolvable path (see [Images](#11-images--assets)).

For **display formatting** (thousands separators, percentages, uppercase) use a field
`transform`, or the config-level `format` (`int`, `trInt`, `pct1`, `pct2`, `upper`):

```ts
{ to: "votes", from: "raw.votes", transform: (v) => Number(v).toLocaleString("tr-TR") }
```

Numbers are coerced to floats (decimals preserved) — never silently truncated to int.

---

## 11. Images & assets

Image bindings need a path the controller's renderer can resolve. Wrap raw values with
`image()` and let an **image resolver** turn them into controller paths.

```ts
import { image, passthroughImages, linkingImages, uploadingImages } from "@airz/rundown-sdk";

// In a field, mark the binding as an image:
{ to: "home_logo", from: "home.logoUrl", image: true }
```

Resolvers (pass one to `new PanelBinder(client, { images })`):

- **`passthroughImages`** — use the value as-is (already a controller path/URL).
- **`linkingImages(client, { folder })`** — look the asset up in the controller's asset
  store by name/path and use its managed `localPath`. Best when the images already live on
  the controller.
- **`uploadingImages(client, opts?)`** — upload raw bytes/URLs to the controller and bind
  the returned `localPath`. Best when your app owns the images.

You can also drive the asset store directly: `client.assets.list()` / `client.assets.upload(name, bytes, folder)`.

---

## 12. Configuration: `MappingConfig` & the Configurator

Rather than hard-coding panels, describe them as data (`MappingConfig`) and let non-devs
edit the mapping in a UI (`@airz/config-ui`).

```ts
interface MappingConfig {
  version: number;
  server: { baseUrl: string };
  panels: PanelConfig[];
}

interface PanelConfig {
  panelId: string;
  label?: string;
  rundownId: number;
  itemId: number;
  select?: string;            // static slice path
  selectBy?: SelectStep[];    // selector-driven slice (from runtime selectors)
  fields: FieldConfig[];
  debounceMs?: number;
  air?: "cue" | "live";       // air policy (see §9)
  liveFields?: string[];      // per-field live override (see §9)
}
```

Turn a `PanelConfig` into a runtime `PanelSpec` for the binder:

```ts
import { configToPanelSpec } from "@airz/rundown-sdk";

for (const pc of config.panels) {
  binder.add(configToPanelSpec(pc, { selectors }));  // selectors drive `selectBy`
}
```

`configToPanelSpec` carries through `air`, `liveFields`, `select`/`selectBy`, `debounceMs`,
and image/format field options.

### The Configurator overlay (`@airz/config-ui`)

```tsx
import { AirzConfigurator } from "@airz/config-ui";

<AirzConfigurator
  open={showConfig}
  onClose={close}
  config={config}
  onChange={saveConfig}
  panelCatalog={PANEL_CATALOG}   // predefined panels the operator picks from
  sourcePaths={KNOWN_PATHS}      // autocomplete for field source paths
  client={client}
/>
```

It gives the operator: connect to a controller, **pick a panel from your catalog**, bind a
rundown item, map each template binding to a source path (with autocomplete), choose the
**Air policy** (Cue/Live), and ⚡-flag individual fields as live. A **panel catalog** lets
you offer named panels (e.g. *Presidential Ticker* = live, *City Results* = cue) so the
operator just picks and binds — no manual panel creation:

```ts
import type { PanelCatalogEntry } from "@airz/config-ui";

const PANEL_CATALOG: PanelCatalogEntry[] = [
  { panelId: "ticker",     label: "Presidential Ticker", air: "live",
    fields: tickerFields, sourcePaths: candidatePaths },
  { panelId: "fullscreen", label: "City / District Results", air: "cue", select: "activeRegion",
    fields: cityFields, sourcePaths: partyPaths },
];
```

A catalog entry's **`sourcePaths`** scopes the field-mapping autocomplete to *that panel's*
properties — so selecting the city panel never offers candidate paths, and vice-versa. When
omitted, the Configurator's global `sourcePaths` prop is used.

### Persistence

```ts
import { localStorageConfig, urlHashConfig } from "@airz/rundown-sdk";

const store = urlHashConfig();          // shareable — config travels in the URL
// const store = localStorageConfig();  // per-browser
const config = store.load() ?? STARTER_CONFIG;
store.save(config);
```

---

## 13. Cross-machine config sync

To let a config edited on one machine appear on others (all pointed at the same
controller), store it on the controller and watch for changes.

```ts
import { discoverAndWatchRemoteConfig } from "@airz/rundown-sdk";

const stop = discoverAndWatchRemoteConfig(client, "electiondesk", {
  onConfig: (config, where) => applyConfig(config),
});
// later: stop();
```

It uses the controller's first-class **web-config store** (`/api/v1/web-configs`) when
available, and falls back to a dedicated item stash on older controllers. It re-delivers on
change *and* on first appearance (another machine saving after you connect). Related:
`saveRemoteConfig`, `loadRemoteConfig`, `watchRemoteConfig`, and the low-level
`client.webConfigs.{get,put,remove,keys,available}`.

> A one-time `404` on `GET /web-configs/mapping:<app>` just means no config is stored yet —
> it's handled (returns "not found"), not an error. See [Troubleshooting](#18-troubleshooting).

---

## 14. Realtime: streaming, mirror, presence, locks

### The SSE stream

```ts
const stream = client.stream({ rundownId });   // omit rundownId for all rundowns
const off = stream.on("item.updated", (e) => console.log(e.data));
stream.on("*", (e) => console.log(e.event, e.data));   // everything
stream.close();
```

Event names (`RUNDOWN_EVENTS`): `hello`, `rundown.{created,updated,deleted,changed}`,
`item.{created,updated,deleted,reordered,trigger,editing}`,
`group.{created,updated,deleted,reordered}`, `asset.{created,updated,deleted}`,
`lock.changed`, `presence.update`, `webconfig.updated`.

The stream auto-reconnects with jittered backoff (`minRetryMs`/`maxRetryMs`/`maxRetries`),
and reports lifecycle via `onState` (`connecting` | `open` | `closed`).

### Higher-level helpers

- **`RundownMirror`** — keeps a live local snapshot of a rundown (items/groups) in sync.
- **`PresenceKeeper`** — heartbeats "I'm viewing this rundown" and exposes who else is.
- **`LockManager`** — acquire/refresh/release soft item locks (ENPS-style).

---

## 15. `LinkedItem`: two-way control

When the controller should drive **your app** (the operator picks a city on the controller;
your app fetches that city's data and pushes results), `LinkedItem` watches an item's
control bindings and calls you back on local *or* remote changes.

```ts
import { LinkedItem } from "@airz/rundown-sdk";

const link = new LinkedItem(client, {
  rundownId, itemId,
  stream,                              // a live client.stream(...)
  controls: ["activeCity"],            // which bindings are "controls"
  onControlChange: async (controls, ctx) => {
    // ctx.origin: "init" | "local" | "remote"
    const data = await fetchCity(controls.activeCity);
    await binder.updateOne("results", data);
  },
});

await link.setControl({ activeCity: "amasya" });  // local set → also pushes to controller
link.dispose();
```

---

## 16. Full worked example: an election desk

A live **ticker** (always on screen, streams) plus a cue'd **fullscreen** (taken with
VER/ALL):

```ts
import { createClient, PanelBinder, configToPanelSpec, linkingImages } from "@airz/rundown-sdk";

const client = createClient({ baseUrl });
await client.auth.login("operator", pw);

const binder = new PanelBinder(client, { images: linkingImages(client, { folder: "/Election" }) });

// From config (Configurator-authored). Ticker = air:"live", fullscreen = air:"cue".
for (const pc of config.panels) binder.add(configToPanelSpec(pc, { selectors }));

// Rehearse ↔ On-Air toggle:
binder.setOnAir(onAir);

// On every feed tick / selection change:
async function pushAll(feed) {
  await binder.update(feed);   // ticker streams (once on air); fullscreen cues to preview
}

// Operator selects a city → cue the fullscreen (preview updates automatically via update()).
// Operator hits VER → take the fullscreen to air with the full latest data:
await binder.take("city-results", "VER");

// The ticker is taken on air once (its trigger or the controller TAKE); then it streams:
await binder.fire("general-ticker", "SHOW");
```

The runnable version lives in `examples/election-desk`.

---

## 17. Error handling

Every request rejects with an `ApiError` carrying the HTTP status:

```ts
import { ApiError } from "@airz/rundown-sdk";

try {
  await client.items.setData(r, i, data);
} catch (e) {
  if (e instanceof ApiError) {
    if (e.status === 401) await client.auth.login(user, pw);   // token expired
    else if (e.status === 423) console.warn("item is locked by someone else");
    else console.error(`API ${e.status}: ${e.message}`);
  }
}
```

`BindingSync` re-queues failed keys automatically and calls your `onError`. A `404` from
`webConfigs.get` is treated as "not set" (returns `undefined`), not thrown.

---

## 18. Troubleshooting

**Repeated `404 GET /web-configs/mapping:<app>`.** No config is stored on the controller
(yours may live in the URL hash / localStorage). It's harmless — the SDK only re-checks on
`webconfig.updated`, not on every data push. To make it disappear, save the config to the
controller (`saveRemoteConfig` / the Configurator's save), or ignore it.

**Data updates the preview but never the program.** The item isn't on air. Live data only
reaches program for on-air items — take the graphic on air first (a trigger / `take()` /
the controller TAKE). For cue panels this is expected: they only air on `take()`.

**Staged changes don't show anywhere.** Confirm the controller build supports the staged
buffer, that the previewed item is the one you're pushing, and that you're calling
`update()` (not only `take()`).

**A cue `take()` sends incomplete data.** Ensure the panel's data was flushed before the
take (the binder does this in `take()`), and that the controller merges staged writes.

**CORS / mixed content.** Serve your app over `http://` on the LAN (not `https://`) to a
`http://<controller>:3467` API, or front both behind the same origin.

**Triggers 403.** Your role can't fire triggers. Use an `operator`/`admin`/`graphics`
token; `journalist`/`readonly` can stage but not go live.

---

## 19. API reference

### `AirzClient`
`createClient(opts)` · `new AirzClient(opts)` · `.setToken()` · `.getToken()` · `.stream(opts?)`
· namespaces: `.auth` `.rundowns` `.items` `.templates` `.assets` `.webConfigs`

| Namespace | Methods |
| --- | --- |
| `auth` | `login(user, pw)` · `logout()` · `me()` |
| `rundowns` | `list(filters?)` · `get(id)` · `create(input)` · `presence(id)` |
| `items` | `list(rId)` · `get(rId, iId)` · `create(rId, input)` · `setData(rId, iId, data, {mode?})` · `trigger(rId, iId, name, {mode?, flushStaged?})` · `pushStaged(rId, iId)` · `update(rId, iId, updates)` · `lock/unlock/setEditing` · `bindingSync(opts)` |
| `templates` | `list(query?)` · `get(id)` |
| `assets` | `list(query?)` · `upload(name, data, folder?)` |
| `webConfigs` | `available()` · `keys()` · `get(key)` · `put(key, value)` · `remove(key)` |

### `BindingSync`
`prime(current)` · `set(partial)` · `flush()` · `setMode(mode)`

### `PanelBinder`
`new PanelBinder(client, { images?, mode? })` · `add(spec)` · `prime(name, current)` · `has(name)`
· `setOnAir(bool)` · `onAir` · `update(source)` · `updateOne(name, source)` · `take(name, trigger)` · `fire(name, trigger)`

### Config
`configToPanelSpec(pc, opts)` · `emptyConfig()` · `localStorageConfig()` · `urlHashConfig()`
· `describeTemplateBindings(client, templateId)` · `saveRemoteConfig` · `loadRemoteConfig`
· `autoDiscoverRemoteConfig` · `watchRemoteConfig` · `discoverAndWatchRemoteConfig`
· `validateConfigTargets` · `isLoopbackUrl`

### Realtime
`client.stream(opts)` → `RundownStream` (`on(name|"*", cb)` · `close()` · `reconnectAttempts`)
· `RundownMirror` · `PresenceKeeper` · `LockManager` · `RUNDOWN_EVENTS`

### Images
`image(src, name?)` · `passthroughImages` · `linkingImages(client, {folder})` · `uploadingImages(client, opts?)`

### Two-way
`new LinkedItem(client, opts)` → `setControl(values)` · `dispose()`

---

Built for airZ Studio · Rundown API `v1` · no runtime dependencies.
