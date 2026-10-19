# Avrupa Protesto Masası — a producer desk for the Europe protest-map wall

A single-file **producer desk** on the airZ Web SDK that drives the Europe
protest-map video wall (`europe_protest_map.riv`) in an airZ Controller rundown
item, with demo data shaped like the scene's own sample story (Paris → Europe).

Built the same way as `tjk-race-desk`: one `<script src>` loads the whole SDK as
a browser global (`window.Airz`) — no bundler.

```
npx serve .        # from the repo root
# then open:
http://localhost:3000/examples/europe-protest-desk/
```

Or double-click **`run-europe-desk.cmd`**.

## What it does

- **Story sheet.** A built-in sample (the **same story as the scene defaults** —
  25-country scope, 30 cities, 8 events, 9 photos, France the origin, day 9/14)
  written as flat values. Edit the headline fields inline; load your own sheet as
  **JSON** or a country **CSV** from the ⤵ Sayfa drawer; export the current story
  as JSON.
- **Producer buttons** — write `command`, the number the scene resets to 0 itself:
  Açılışı oynat (9) · Avrupa (1) · Geri (2) · Zaman (3) · Fotoğraflar (4) ·
  Karşılaştır (5) · Oynat/Durdur (6) · foto ‹ (21) › (22). Each in-play country
  has a **▶** that flies to it (`goCountry` = code, then `command` 10).
- **Oto-açılış toggle** (`autoIntro`) — on: the opening plays on each program take;
  off: it waits for Açılışı oynat (cue).
- **1080 çıkış toggle** (`textBoost`) — writes 1 or 1.4; turn it on when the wall is
  shown on a 1920×1080 channel so the small interface text and map labels grow and
  stay readable after scaling.
- **Wall-state mirror.** The scene publishes `viewLevel` (0 Avrupa · 1 ülke ·
  2 zaman · 3 foto · 4 karşılaştır), `viewCountry`, `day` and `playing`; the desk
  **reads** these (via the live stream) and lights the matching button and country
  row, so it always matches the wall even when the presenter drives by touch. The
  desk never writes the view values.
- **Day slider** writes `day` (1..dayMax) and follows playback back (echo-guarded,
  and never fights a drag). A **ÖRNEK VERİ / YAYIN** switch toggles `sampleTag`.
- **Sanity pass before air** — flags a country with level > 0 but no city, a city
  whose country isn't in play, and an in-play country with no source (disputed
  figures must carry one).
- **Prova senaryosu** — a ~35 s hands-free rehearsal: opening → Avrupa → zaman →
  fly to France → photos → fly to Germany → compare → back.

## Keys

`1` Avrupa · `2` Geri · `3` Zaman · `4` Fotoğraflar · `5` Karşılaştır ·
`Space` Oynat/Durdur · `9` Açılışı oynat · `← / →` önceki / sonraki foto.

## The contract (why it's all flat keys)

Confirmed with the scene author against the built scene
(`rive_cli/europe_protest_map/PLAN.md` "Status"):

- **Everything is a flat property** — `FRA_level`, `city1_lat`, `ev3_line`,
  `photo2_caption`. No list rows, so plain numbers work (numbers are still sent as
  `{type:"number"}` for robustness before the template's first run).
- **Actions go through `command`** (a number) and `goCountry` (a code) via
  `setData` — there are **no triggers**. Because `command` is edge-triggered and
  `/data` merges, the desk writes `command=N` then `command=0` ~220 ms later so the
  same button re-fires; successive commands are spaced ≥ 60 ms so two never land in
  one scene frame.
- **Photos are metadata only** (`photoN_country/_city/_caption/_time/_credit`); the
  images arrive through the Controller's image-folder ingest (one folder per
  country) into slots `photo1…photo12`.
- **View values are read-only** — `viewLevel`, `viewCountry`, `day`, `playing`,
  `camX/Y/S` are published by the scene; the desk reads, never writes them.

## Preview

The preview is the Controller's own `/interactive/<rundown>/<item>` page (the real
wall) when connected. There is **no local `.riv` preview** for this scene: its
camera, lat/lon projection and photo carousel are Luau, which the stock
`@rive-app/canvas` web runtime doesn't run. With no controller the desk runs dry
(payloads in the log) and the wall-state mirror reflects what it would send.

## Swapping the demo for a real feed

The built-in sample lives in `buildSample()` (mirroring the scene's `gen.py`
defaults). Replace it, or load a JSON/CSV sheet at run time — nothing else in the
desk changes.
