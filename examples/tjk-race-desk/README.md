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
- **Race strip** (bottom) — two separate controls:
  - **YARIŞ EKRANI** (manual, on-air): sets `frame=race` (plays the race-start
    transition) and brings the graphic in if needed, then shows the running order
    at its seeded positions. It does **not** auto-advance — operator-timed, for a
    real broadcast. Run it in **CANLI** so it drives the program wall live.
  - **SİMÜLASYON** (demo toggle): the clock-driven run for rehearsal —
    `dial/progress` ~3×/s, overtakes change `siralama` on two rows, a split row is
    added at each pole. A second press stops it.
  - **BİTİR** builds `results` from the final order; **KESİNLEŞTİR** fires
    `resultsOfficial`; **PROTESTO** toggles the band/badge.
- **Simulation** — odds drift (a random walk pulled toward each horse's AGF, with
  the scene's `flash` on change; speed slider + freeze), paddock auto-cycle, race
  events (jockey change, late Koşmaz that closes the lists up, photo finish), and
  a one-button **Senaryo** (~2 min hands-free showcase).
- **Preview** — when connected, the panel **embeds the Controller's own
  `/interactive/<rundown>/<item>` page** (the real scene with the real data, lists
  and all), with `?parentOrigin=…&chrome=embed&role=control` and the auth token in
  `?t=`. That page self-syncs with the Controller, so the embed follows the desk's
  writes. It frames whenever the Controller allows this origin via
  `Content-Security-Policy: frame-ancestors` — Controller ≥ the framing update lists
  `localhost:3000/3001` and the LAN IPs. An **older** Controller still sends
  `X-Frame-Options: SAMEORIGIN` and the frame stays blank; then use **"Önizlemeyi
  yeni sekmede aç ↗"** (same page, new tab, not subject to framing). With **no**
  controller the desk runs dry and shows the vendored `tjk.riv` on a local canvas
  (triggers/frame/dial only — lists and the Luau scripts need the Controller).
  Note: the full player's Luau + WebGPU need a **secure context**, so serve the desk
  from **`http://localhost`** (or HTTPS) rather than a bare LAN IP for full fidelity.
- **Sidebar paging** — for fields over ~9 runners the scene auto-scrolls the
  `sideRunners` sidebar (rest a page, glide 0.6 s, loop back). The desk already
  sends all 16 rows; tune the pace from **Ayarlar → Yan panel kaydırma**
  (`sideScrollSecs`, default 3 s; `0` holds page 1). The scene writes `sideScrollY`
  itself — the desk never sends it.

## Keys

`Space` TAKE · `Esc` current layer out (`Shift+Esc` = animateOut) · `↑ ↓` select
runner · `Enter` card · `B` yarış ekranı · `S` simülasyon · `N` bitir · `F1` L-frame/Yarış · `F2` Sıralı
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

You may still see these lines in the browser console for the local preview:

```
ScriptAsset doesn't have a generator function clock
ScriptAsset doesn't have a generator function side_scroll
```

They come from the scene's own Luau scripts (the clock, and the sidebar-paging
`side_scroll`) — the web runtime registers them on import but can't run them. Both
are purely cosmetic (local preview only) — nothing to chase. One consequence:
because `side_scroll` doesn't run in the local preview, **the sidebar holds page 1
there even with 10+ runners** — don't judge the paging from the desk preview. On
air the engine runs the script and pages through the field; verify it through the
Controller, not the local `.riv`.

## Swapping the demo for a real feed

`Source.getProgram()` is the single seam. Today it returns the embedded demo
programme; point it at a licensed TJK feed or the Controller's data connections
later — nothing else in the desk changes.
