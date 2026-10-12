# TJK Yarış Masası — a plain-HTML race control desk

A single-file operator desk on the **airZ Web SDK** that drives the TJK L-frame
graphic (`tjk.riv`) inside an airZ Controller rundown item, with demo data shaped
like tjk.org's race programme.

It is built the same way as `lineup-desk`: one `<script src>` loads the whole SDK
as a browser global (`window.Airz`) — no bundler, no Vite.

```
npx serve .        # from the repo root
# then open:
http://localhost:3000/examples/tjk-race-desk/
```

Or double-click **`run-tjk-desk.cmd`**.

## What it does

- **Program rail** — the day's hippodromes and races (Bursa race 1 is the
  tjk.org screenshot; the rest are generated plausibly). Pick a race to pre-bind
  its whole scene (header, running order, odds, the sidebar's next race, abroad).
- **Runner table** — saddle no (coloured cloth), horse, jockey, weight, gate, AGF,
  ganyan. Each row has a **▶ take button** (the "Al" column) that puts that horse
  straight on the card — the first one fires `runnerIn`, the next crawls the A/B
  slot to it. The horse currently on the card is outlined and its button becomes an
  **✕ take-out** that fires `runnerOut`. `↑ ↓` select, `Enter` takes the selected
  runner.
- **Layer controls** (right) — every scene trigger has a button:
  Ekran (`animateIn`/`animateOut`) · Çerçeve (`frame` L-frame ⇄ Yarış) ·
  At kartı (`runnerIn`/`runnerOut` with the A/B crawl via `runnerSlot`) ·
  Sıralı 2'li (`exacta*`) · Havuz (`pools*`) · Sonuç (`results*`,
  `resultsOfficial`) · Protesto (band + badge) · Yan panel (`side`).
- **Smart conflicts** — the full runner card, Sıralı 2'li, Havuz and Sonuç all
  occupy the same centre-stage region, so they are mutually exclusive: taking one
  in automatically takes the previous one off first (its Out trigger fires), so
  two centre animations never fight. The Protesto **band** is a frontmost overlay
  and coexists (and the race frame drops it, as the scene does); the sidebar is
  independent.
- **Race strip** (bottom) — `BAŞLAT` sets `frame=race` and runs the simulator:
  `dial/progress` ~3×/s, overtakes change `siralama` on two rows, a split row is
  added at each pole. `BİTİR` builds `results` from the final order; `KESİNLEŞTİR`
  fires `resultsOfficial`; `PROTESTO` toggles the band/badge.
- **Simulation** — odds drift (a random walk pulled toward each horse's AGF, with
  the scene's `flash` on change; speed slider + freeze), paddock auto-cycle, race
  events (jockey change, late Koşmaz that closes the lists up, photo finish), and
  a one-button **Senaryo** (~2 min hands-free showcase).
- **Preview** — when connected, the Controller's own `/interactive/<rundown>/<item>`
  page is embedded as the real scene with the real data. With no controller, the
  desk runs **dry** (payloads in the log panel) and loads the vendored `tjk.riv`
  locally for a visual taste (triggers / frame / dial; lists render fully only
  through the Controller).

## Keys

`Space` TAKE · `Esc` current layer out (`Shift+Esc` = animateOut) · `↑ ↓` select
runner · `Enter` card · `B` başlat · `N` bitir · `F1` L-frame/Yarış · `F2` Sıralı
2'li · `F3` Havuz · `F4` Sonuç · `F5` Protesto.

## Cue / live (HAZIRLA ⇄ CANLI)

- **HAZIRLA** — every action stages data (`setData {mode:"staged"}`) and fires its
  trigger to the preview only. A single **TAKE** (`Space`) promotes the prepared
  data to air (`pushStaged`) and fires the queued triggers live.
- **CANLI** — actions go straight to air (`setData {mode:"live"}` + live trigger).

## The data contract (why the lists look the way they do)

Confirmed against the Controller source:

- **Nested fields** are flat keys joined by `/` — `race/city`, `runnerA/name`,
  `dial/progress`.
- **List rows** are flat keys `name[i]/field` — `order[3]/siralama`. The engine
  reads a changed list as the **whole list** and trims it to the highest index it
  receives, so a changed list is always sent in full.
- `PATCH /items/{id}/data` **merges** (never replaces), so a list can grow but not
  shrink. Every list is therefore **fixed-length** with a `show` flag per row
  (1 drawn, 0 hidden); unused rows are sent with `show=0`. Sizes: `order` 18,
  `sideRunners` 16, `splits` 8, `abroad` 8, `exacta` 11, `pools` 8.
- A list **number cell** arrives typed `"string"` unless pre-wrapped, so number
  cells go as `{type:"number",value:n}` and colour cells as `{type:"color",...}`.
- **Enums** (`frame`, `track`) are a plain string = the option's exact name.
- **Triggers** go through `items.trigger()` — `/data` drops trigger keys.

The full scene contract lives in `rive_cli/tjk/DATA.md`; the desk/UX plan in
`rive_cli/tjk/INTERFACE_PLAN.md`.

## The clock in the local preview

The scene's clock is a Luau script (`clock.luau`) that the Controller and the Rive
editor run, but the stock `@rive-app/canvas` web runtime does not. So in the
**local, vendored-`.riv` preview only**, the desk takes the scene's own switch —
it sets `clockLive = 0` (stopping the absent script) and writes `clockTime`,
`clockDate` and `clockDateShort` itself every second from the browser clock
(Turkish month/day names, e.g. `13:16:59` · `7 Temmuz, Çarşamba` · `7 Temmuz, Çar.`).
On the **Controller path** `clockLive` stays `1` and the playout machine's clock
drives it.

You may still see this line once in the browser console for the local preview:

```
ScriptAsset doesn't have a generator function clock
```

It comes from the file import (the runtime registers the script but can't run it)
and is purely cosmetic — nothing to chase.

## Swapping the demo for a real feed

`Source.getProgram()` is the single seam. Today it returns the embedded demo
programme; point it at a licensed TJK feed or the Controller's data connections
later — nothing else in the desk changes.
