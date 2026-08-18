// A ready-made MappingConfig — exactly what the AirzConfigurator overlay
// produces/edits. Targets (rundownId/itemId) start at 0; the operator sets them
// by picking a rundown + item in the overlay. Field maps are pre-filled so the
// overlay opens fully populated for the 2023 election templates.

import type { FieldConfig, MappingConfig } from "@airz/rundown-sdk";

// General ticker: each repeated slot is its own binding key → its own mapping.
const candidateFields: FieldConfig[] = [
  { to: "Headline", from: "headline" },
  { to: "Reporting", from: "reporting", format: "pct1" },
  ...[0, 1, 2, 3].flatMap((n): FieldConfig[] => [
    { to: `Candidate ${n + 1} Name`, from: `candidates.${n}.name` },
    { to: `Candidate ${n + 1} Alliance`, from: `candidates.${n}.alliance` },
    { to: `Candidate ${n + 1} Pct`, from: `candidates.${n}.percent`, format: "pct2" },
    { to: `Candidate ${n + 1} Votes`, from: `candidates.${n}.votes`, format: "trInt" },
    { to: `Candidate ${n + 1} Photo`, from: `candidates.${n}.photoUrl`, image: true },
  ]),
];

// City / county panels are sliced to the active place at runtime, so their
// field paths are RELATIVE to that place (name, parties.N.*).
const placeFields = (): FieldConfig[] => [
  { to: "City Name", from: "name" },
  { to: "Reporting", from: "reporting", format: "pct1" },
  ...[0, 1, 2].flatMap((n): FieldConfig[] => [
    { to: `Party ${n + 1} Name`, from: `parties.${n}.party` },
    { to: `Party ${n + 1} Pct`, from: `parties.${n}.percent`, format: "pct1" },
    { to: `Party ${n + 1} Votes`, from: `parties.${n}.votes`, format: "trInt" },
    { to: `Party ${n + 1} Seats`, from: `parties.${n}.seats`, format: "int" },
    { to: `Party ${n + 1} Logo`, from: `parties.${n}.logoUrl`, image: true },
  ]),
];

// The city panel carries a CONTROL input: "City Code" is watched, not pushed,
// and feeds the `activeCity` selector. Its `selectBy` then re-slices the feed to
// that city. Nothing here is special-cased in code — the slice + control wiring
// live entirely in config, so any app with any names works the same way.
const cityFields: FieldConfig[] = [
  { to: "City Code", direction: "in", as: "activeCity" },
  ...placeFields(),
];
const countyFields: FieldConfig[] = [
  { to: "County Code", direction: "in", as: "activeCounty" },
  ...placeFields(),
];

export const STARTER_CONFIG: MappingConfig = {
  version: 1,
  server: { baseUrl: "http://127.0.0.1:3467" },
  panels: [
    {
      panelId: "general-ticker",
      label: "General Presidential Ticker",
      rundownId: 0,
      itemId: 0,
      debounceMs: 100,
      fields: candidateFields,
    },
    {
      panelId: "city-results",
      label: "City Results",
      rundownId: 0,
      itemId: 0,
      debounceMs: 100,
      // slice: cities[] → the one whose .code == selectors.activeCity
      selectBy: [{ path: "cities", matchField: "code", selector: "activeCity" }],
      fields: cityFields,
    },
    {
      panelId: "county-results",
      label: "County (İlçe) Results",
      rundownId: 0,
      itemId: 0,
      debounceMs: 100,
      // slice: cities[activeCity].counties[] → the one whose .code == activeCounty
      selectBy: [
        { path: "cities", matchField: "code", selector: "activeCity" },
        { path: "counties", matchField: "code", selector: "activeCounty" },
      ],
      fields: countyFields,
    },
  ],
};
