# Connecting panels to playlist items (multi-panel mapping)

**Audience:** integrators wiring one data feed to several graphics at once.
**Requires:** `@airz/rundown-sdk` ≥ 0.1.0 (mapping + connections modules).

This guide answers the core question: **how do users connect different HTML
panels to different playlist items — including images?** It uses the 2023
Türkiye election as the running example: one feed driving a **general
presidential ticker** and a **per-city results** panel, each with headshots or
party logos.

---

## 1. The three moving parts

```
   ┌── Connection ──┐     ┌──── PanelSpec ────┐     ┌─ PanelBinder ─┐
   panel → item        source slice → bindings       runs it, live
   (who)               (how, incl. images)           (diffed push)
```

| Part | Answers | Lives in | Authored by |
|------|---------|----------|-------------|
| **Connection** | *which* item a panel drives | a `ConnectionStore` (persisted) | operator at runtime, or convention |
| **PanelSpec** | *how* source data maps to bindings | your code | integrator, once per template |
| **PanelBinder** | pushing it, efficiently | runtime | the SDK |

Keeping these separate is what lets the **same** map serve every show, while the
**connection** changes per rundown, and the **feed** changes every second.

---

## 2. Connections — "which panel drives which item?"

A panel is an id you choose (`"general-ticker"`, `"city-results"`). A connection
binds it to a concrete `(rundownId, itemId)`.

### 2a. Operator picks at runtime (recommended)

Populate dropdowns from the live rundown, save the choice, reload it next time:

```ts
import { localStorageConnections } from "@airz/rundown-sdk";

const store = localStorageConnections("airz.election2023");

// From UI: operator selects the item for a panel.
store.set({ panelId: "general-ticker", rundownId: 7, itemId: 42 });
store.set({ panelId: "city-results",  rundownId: 7, itemId: 43 });

// On next launch, rehydrate the UI:
const saved = store.all(); // [{panelId, rundownId, itemId}, ...]
```

The `election-2023` example renders exactly this: a rundown selector plus one
item dropdown per panel, persisted across reloads.

### 2b. Auto-bind by convention

If your items are always built from templates named "General Ticker" / "City
Results", skip the manual pick:

```ts
import { resolveTargets } from "@airz/rundown-sdk";

const { resolved, missing } = await resolveTargets(client, store, [
  { panelId: "general-ticker", rundownId: 7, templateNameHint: "General Ticker" },
  { panelId: "city-results",   rundownId: 7, templateNameHint: /city results/i },
]);
// resolved: connections found (saved OR matched by template name, then cached)
// missing:  panelIds with no target yet → prompt the operator for these
```

`ConnectionStore` is an interface — swap `localStorageConnections()` for
`memoryConnections()` (tests) or your own backend (a shared config service so
every operator machine sees the same bindings).

---

## 3. PanelSpec — "how does data map to bindings?"

A `PanelSpec` adapts your feed's shape to one template's binding keys. Author it
once and reuse it for every election night.

```ts
import { image, type PanelSpec, type PanelTarget } from "@airz/rundown-sdk";

export function generalTickerPanel(target: PanelTarget): PanelSpec<ElectionData> {
  return {
    name: "general-ticker",
    target,                          // { rundownId, itemId } from the connection
    debounceMs: 100,
    fields: [
      { to: "Headline",  from: "headline" },
      { to: "Reporting", from: "reporting", transform: (v) => `%${v}` },
    ],
    repeats: [
      {
        from: "candidates",          // an array in the source
        limit: 4,                    // top 4 → Candidate 1..4
        as: (c, i) => ({
          [`Candidate ${i + 1} Name`]:  c.name,
          [`Candidate ${i + 1} Pct`]:   `%${c.percent.toFixed(2)}`,
          [`Candidate ${i + 1} Votes`]: `${c.votes.toLocaleString("tr-TR")} Oy`,
          [`Candidate ${i + 1} Photo`]: image(c.photoUrl, `cand-${i + 1}.png`),
        }),
      },
    ],
  };
}
```

- **`fields`** — scalar bindings. `from` is a dotted path (`"meta.title"`) or a
  function `(slice) => value`. `transform` formats; return `undefined` to skip a
  key (leaves the binding untouched).
- **`repeats`** — flatten an array into indexed keys. This is how a candidates
  or parties list becomes `Candidate 1 …`, `Party 2 …`, matching a template that
  has N fixed slots.
- **`image(src, name?)`** — marks an image binding. Empty sources are skipped.

> **Confirm your keys.** The strings on the left of each mapping must equal the
> template's real binding keys. Read them once from
> `client.templates.get(templateId).dataBindings`.

### Per-city without per-city config

One city panel serves all 81 provinces — `select` re-slices the shared feed by
the active city, so changing the city changes the data, not the wiring:

```ts
export function cityResultsPanel(
  target: PanelTarget,
  getActiveCityCode: () => string,
): PanelSpec<ElectionData, CityResult | undefined> {
  return {
    name: "city-results",
    target,
    select: (src) => src.cities.find((c) => c.code === getActiveCityCode()),
    fields: [
      { to: "City Name", from: (c) => c?.name ?? "" },
      { to: "Reporting", from: (c) => (c ? `%${c.reporting}` : "") },
    ],
    repeats: [
      {
        from: (c) => c?.parties ?? [],
        limit: 3,
        as: (p, i) => ({
          [`Party ${i + 1} Name`]: p.party,
          [`Party ${i + 1} Pct`]:  `%${p.percent.toFixed(1)}`,
          [`Party ${i + 1} Logo`]: image(p.logoUrl, `${p.party}.png`),
        }),
      },
    ],
  };
}
```

---

## 4. Images — headshots and party logos

Image bindings need a value the controller's renderer can resolve. Wrap the
source with `image()`; the binder resolves it via a strategy you choose:

```ts
import { PanelBinder, passthroughImages, uploadingImages } from "@airz/rundown-sdk";

// A) Pass the URL straight through (renderer fetches it directly).
const binder = new PanelBinder(client, { images: passthroughImages });

// B) Upload each distinct image to the controller's asset store ONCE and reuse
//    the returned local path — ideal for stable headshots/logos.
const binder2 = new PanelBinder(client, {
  images: uploadingImages(client, { folder: "/election" }),
});
```

- **passthrough** — zero uploads; the image must be reachable by the renderer.
- **uploading** — fetches the bytes, `POST`s to `/api/v1/assets`, and caches by
  URL so each headshot uploads only on first sight. Every later push sends the
  cheap `localPath`. Best for air-gapped LANs and repeated assets.

---

## 5. PanelBinder — run it live

Add every panel, then feed the source whenever it updates. The binder recomputes
all panels, resolves images, and diff-pushes only what changed per item.

```ts
const binder = new PanelBinder(client, { images: uploadingImages(client) });

binder.add(generalTickerPanel({ rundownId: 7, itemId: 42 }));
binder.add(cityResultsPanel({ rundownId: 7, itemId: 43 }, () => activeCity));

// Optional: seed each panel's diff baseline from current on-air values.
binder.prime("general-ticker", generalItem.data);

// Each time the feed updates (poll, websocket, operator edit):
await binder.update(feed);        // pushes both panels
// or just one:
await binder.updateOne("city-results", feed);
```

At steady state (unchanged numbers) `update()` sends **nothing** — the diffing
sync suppresses redundant writes. Only the candidate whose count moved is PATCHed.

---

## 6. Full example

`examples/election-2023` assembles all of the above:

- feed: `src/data.ts` (mock 2023 presidential + Ankara/İstanbul splits, with
  image URLs),
- maps: `src/panels.ts` (`generalTickerPanel`, `cityResultsPanel`),
- app: `src/App.tsx` — rundown selector, **panel→item dropdowns** (persisted),
  active-city selector, an image-upload toggle, and a "Push to air" that runs
  the binder.

```bash
npm install && npm run build:sdk
npm run dev --workspace election-2023   # open the URL, set Controller URL
```

---

## 7. Advanced: many rundowns, keyed targets

- **Different rundowns per panel** — `PanelTarget` carries its own `rundownId`,
  so panels may live in separate rundowns; the binder handles each independently.
- **One item per city** (instead of a single re-sliced panel) — add one panel
  per city, each `select`ing its own city and targeting that city's item:

  ```ts
  for (const city of feed.cities) {
    const conn = store.get(`city-${city.code}`);
    if (!conn) continue;
    binder.add(cityResultsPanel(
      { rundownId: conn.rundownId, itemId: conn.itemId },
      () => city.code,
    ));
  }
  ```

- **Fire animations after data lands** — push with the binder, then
  `client.items.trigger(rundownId, itemId, "Animate-In")` (operator role) once
  the values are set.
