// Panel maps — authored ONCE per template type, reused for every show.
//
// Each PanelSpec adapts the feed's shape to a template's exact data-binding
// keys. `repeat` flattens an array (candidates / parties) into indexed keys like
// "Candidate 1 Name"; `image()` marks headshot/logo bindings for resolution.
//
// Confirm the binding keys against your real template via
//   client.templates.get(templateId).dataBindings

import { image, type PanelSpec, type PanelTarget } from "@airz/rundown-sdk";
import type { Candidate, CityResult, ElectionData, PartyResult } from "./data.js";

const tr = (n: number) => n.toLocaleString("tr-TR");
const pct = (n: number, d = 2) => `%${n.toFixed(d)}`;

/** General presidential ticker — one item, repeated candidate rows + images. */
export function generalTickerPanel(target: PanelTarget): PanelSpec<ElectionData> {
  return {
    name: "general-ticker",
    target,
    debounceMs: 100,
    fields: [
      { to: "Headline", from: "headline" },
      { to: "Reporting", from: "reporting", transform: (v) => pct(v as number, 1) },
    ],
    repeats: [
      {
        from: "candidates",
        limit: 4,
        as: (c: Candidate, i) => ({
          [`Candidate ${i + 1} Name`]: c.name,
          [`Candidate ${i + 1} Alliance`]: c.alliance,
          [`Candidate ${i + 1} Pct`]: pct(c.percent),
          [`Candidate ${i + 1} Votes`]: `${tr(c.votes)} Oy`,
          [`Candidate ${i + 1} Photo`]: image(c.photoUrl, `cand-${i + 1}.png`),
        }),
      },
    ],
  };
}

/**
 * Per-city results — one item, driven by whichever city is active. The
 * `select` closure resolves the active city from the shared feed, so the same
 * panel serves all 81 provinces without 81 configs.
 */
export function cityResultsPanel(
  target: PanelTarget,
  getActiveCityCode: () => string,
): PanelSpec<ElectionData, CityResult | undefined> {
  return {
    name: "city-results",
    target,
    debounceMs: 100,
    select: (src) => src.cities.find((c) => c.code === getActiveCityCode()),
    fields: [
      { to: "City Name", from: (c) => c?.name ?? "" },
      { to: "City Code", from: (c) => c?.code ?? "" },
      { to: "Reporting", from: (c) => (c ? pct(c.reporting, 0) : "") },
    ],
    repeats: [
      {
        from: (c) => c?.parties ?? [],
        limit: 3,
        as: (p: PartyResult, i) => ({
          [`Party ${i + 1} Name`]: p.party,
          [`Party ${i + 1} Pct`]: pct(p.percent, 1),
          [`Party ${i + 1} Votes`]: `${tr(p.votes)} Oy`,
          [`Party ${i + 1} Logo`]: image(p.logoUrl, `${p.party}.png`),
        }),
      },
    ],
  };
}
