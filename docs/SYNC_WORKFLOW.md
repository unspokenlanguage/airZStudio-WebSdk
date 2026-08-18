# Synchronous control/data workflow

**Requires:** `@airz/rundown-sdk` ≥ 0.1.0 (`LinkedItem`, config `direction`).

Some bindings are **inputs** the app reacts to; most are **outputs** the app
produces. This guide covers the two-way selector pattern — e.g. "pick a city and
its results update" — while keeping the hard rule that **data only ever flows
HTML → controller**.

---

## 1. Two classes of binding

| Class | Direction | Example | Who owns the value |
|-------|-----------|---------|--------------------|
| **Data (output)** | **HTML → controller only** | vote %, votes, party name, logo image | the app (source of truth) |
| **Control (input)** | controller ⇄ HTML | `City Code`, `Belde` | either side may set it; the app *watches* it |

The rule you stated: **linked/data values only feed from HTML to the
controller.** The app never reads result values back to overwrite itself. The
only thing it reads from the controller is the **control** value — to decide
*what* data to produce.

There is **no repeat**: a selected city just changes the *values* of the same
binding keys (`Party 1 Pct`, `Party 2 Pct`, …); it never changes the key set.

---

## 2. The loop

```
        operator picks city here ─┐          ┌─ someone edits "City Code" on the controller
                                  ▼          ▼
                         ┌──────────────────────────┐
                         │  control "City Code"      │  (input, watched)
                         └───────────┬──────────────┘
                                     ▼
                       app re-slices feed to that city
                                     ▼
                         push data bindings (one-way) ──▶ controller updates on air
```

Both entry points converge on the same reaction: **city changed → pull that
city's data → push results.** `LinkedItem` implements this and is loop-safe.

---

## 3. `LinkedItem`

```ts
const stream = client.stream({ rundownId });

const link = new LinkedItem(client, {
  rundownId,
  itemId,                       // the city-results item
  stream,
  controls: ["City Code"],      // the input binding(s) to watch
  onControlChange: (controls, ctx) => {
    const code = String(controls["City Code"] ?? "");
    const city = feed.cities.find((c) => c.code === code);
    if (!city) return;
    // Produce DATA outputs for the new selection (one-way):
    ctx.push({
      "City Name": city.name,
      "Party 1 Pct": `%${city.parties[0].percent.toFixed(1)}`,
      "Party 1 Votes": city.parties[0].votes.toLocaleString("tr-TR"),
      // …
    });
    // ctx.origin is "init" | "local" | "remote"
  },
});

// Operator picked a city in the HTML → write the control (html→controller) AND
// fire onControlChange(origin:"local"):
await link.setControl({ "City Code": "34" });

link.close(); // on unmount
```

### What it does

- **Watches** the control keys over SSE. On `item.updated` / `rundown.changed`
  for the item, it re-fetches the item, reads the control values, and if they
  changed fires `onControlChange(origin:"remote")`.
- **`setControl(values)`** writes the control to the controller, updates the
  baseline, and fires `onControlChange(origin:"local")`.
- **`push(results)`** (via `ctx.push`) sends data one-way, diffed — the same
  `BindingSync` guarantees (only changes sent, writes serialized).
- **`primeOnStart`** (default) fires once with `origin:"init"` so the app
  renders the controller's current selection on load.

### Why it does not loop

- Pushing **results** never changes a **control** value, so the result echo's
  re-fetch sees unchanged controls → no re-fire.
- A `setControl` updates the baseline *before* its own SSE echo returns, so the
  echo compares equal → no re-fire.
- Only a genuine change to a watched control key triggers a reaction.

---

## 4. Declaring controls in config

In a `MappingConfig`, mark an input with `direction: "in"` and name the app
selector it feeds via `as`. Control fields are **excluded** from the outbound
push by `configToPanelSpec` (they are read, not written from source):

```ts
{
  panelId: "city-results",
  rundownId: 7, itemId: 43,
  fields: [
    { to: "City Code", direction: "in", as: "activeCity" }, // watched input
    { to: "City Name", from: "name" },                       // data output
    { to: "Party 1 Pct", from: "parties.0.percent", format: "pct1" },
    // …
  ],
}
```

`panelControls(panelConfig)` returns `[{ key: "City Code", as: "activeCity" }]`
so you can feed those keys straight into `LinkedItem.controls`. In the
`AirzConfigurator` overlay, each binding row has an **out/in** selector; choosing
**in** swaps the source-path field for a **selector name** field.

### Config-driven slicing (`selectBy`) — nothing is name-specific

The panel also declares *how* to slice its data from a selector, in config —
so the runtime never hardcodes a name like "city":

```ts
{
  panelId: "county-results",
  // cities[] → element where .code == selectors.activeCity,
  // then counties[] → element where .code == selectors.activeCounty
  selectBy: [
    { path: "cities",   matchField: "code", selector: "activeCity" },
    { path: "counties", matchField: "code", selector: "activeCounty" },
  ],
  fields: [ /* … */ ],
}
```

At push time you pass the current selector values:

```ts
binder.add(configToPanelSpec(panel, { selectors: { activeCity: "06", activeCounty: "06-cankaya" } }));
```

The binding keys, source paths, selector names, and data shape are **all
yours** — the SDK assumes none of them. `ELECTION_2023` in the example is just a
stand-in feed; replace it, the config, and the template, and the same code
runs unchanged.

---

## 5. In the example

`examples/election-2023` wires exactly this:

- The `city-results` panel declares `City Code` as `direction:"in"` (see
  `src/starterConfig.ts`).
- `App.tsx` builds a `LinkedItem` for that panel; a controller-side `City Code`
  edit calls `setActiveCity(code)`, which triggers an **auto-push** of the city
  and county panels.
- Picking a city in the app calls `link.setControl({ "City Code": code })`,
  writing the control back to the controller — so both surfaces stay in sync,
  while every *result* value still travels one way, HTML → controller.
