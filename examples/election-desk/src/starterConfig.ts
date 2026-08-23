import type { FieldConfig, MappingConfig } from "@airz/rundown-sdk";
import type { PanelCatalogEntry } from "@airz/config-ui";
import { SEED_CANDIDATES, SEED_PARTIES, SEED_ALLIANCES } from "./config.js";

// ── Field maps (template binding ← feed source path) ─────────────────────────

// Presidency candidates (4) → their bindings + images.
const candidateFields: FieldConfig[] = [
  { to: "Headline", from: "headline" },
  ...SEED_CANDIDATES.flatMap((c): FieldConfig[] => [
    { to: c.binding, from: `nationalData.candidateVotes.${c.id}` },
    { to: `${c.binding}_IMG`, from: `candidatesById.${c.id}.imagePath`, image: true },
  ]),
];

// National party results (milletvekili) → their bindings + images.
const partyNationalFields: FieldConfig[] = SEED_PARTIES.flatMap((p): FieldConfig[] => [
  { to: p.binding, from: `nationalData.partyVotes.${p.id}` },
  { to: `${p.binding}_IMG`, from: `partiesById.${p.id}.imagePath`, image: true },
]);

// Alliance results (ittifaklar) → result + name only (alliances have no logos).
const allianceFields: FieldConfig[] = SEED_ALLIANCES.flatMap((a): FieldConfig[] => [
  { to: a.binding, from: `nationalData.allianceVotes.${a.id}` },
  { to: `${a.binding}_NAME`, from: `alliancesById.${a.id}.name` },
]);

// The live ticker shows all three national blocks at once: cumhurbaşkanlığı
// (candidates), genel seçim parti sonuçları (parties), and ittifaklar (alliances).
const tickerFields: FieldConfig[] = [
  ...candidateFields,
  ...partyNationalFields,
  ...allianceFields,
];

// City/district full-screen: parties within the selected region (select: activeRegion).
const cityFields: FieldConfig[] = [
  { to: "Headline", from: "cityHeadline" },
  { to: "City Code", direction: "in", as: "activeCity" },
  ...SEED_PARTIES.flatMap((p): FieldConfig[] => [
    { to: p.binding, from: `partyVotes.${p.id}` },
    // activeRegion is enriched with partiesById so the logo resolves within the slice.
    { to: `${p.binding}_IMG`, from: `partiesById.${p.id}.imagePath`, image: true },
  ]),
];

// ── Bindable source paths per panel (Configurator autocomplete scope) ────────
// Ordered arrays (feed sorts by votes) expose name/percent/votes/imagePath for
// each rank — the most useful shape for a ticker/graphic to bind.
const orderedPaths = (base: string, n: number, withImage = true): string[] =>
  Array.from({ length: n }).flatMap((_, i) => [
    `${base}.${i}.name`,
    `${base}.${i}.percent`,
    `${base}.${i}.votes`,
    ...(withImage ? [`${base}.${i}.imagePath`] : []),
  ]);

// Identity-keyed paths (props that shouldn't depend on rank).
const byIdPaths = (base: string, ids: string[], withImage = true): string[] =>
  ids.flatMap((id) => [
    ...(withImage ? [`${base}.${id}.imagePath`] : []),
    `${base}.${id}.name`,
  ]);

const TICKER_PATHS: string[] = [
  "headline",
  "VER",
  "ALL",
  ...orderedPaths("candidates", SEED_CANDIDATES.length),
  ...orderedPaths("parties", SEED_PARTIES.length),
  ...orderedPaths("alliances", SEED_ALLIANCES.length, false), // no logos
  ...byIdPaths("candidatesById", SEED_CANDIDATES.map((c) => c.id)),
  ...byIdPaths("partiesById", SEED_PARTIES.map((p) => p.id)),
  ...byIdPaths("alliancesById", SEED_ALLIANCES.map((a) => a.id), false),
];

const CITY_PATHS: string[] = [
  "cityHeadline",
  "VER",
  "ALL",
  ...orderedPaths("parties", SEED_PARTIES.length),
  ...byIdPaths("partiesById", SEED_PARTIES.map((p) => p.id)),
];

// Parliamentary seats: top-5 parties + "Others" (6 ordered rows) → name / % / seats.
const SEAT_ROWS = 6;
const seatFields: FieldConfig[] = Array.from({ length: SEAT_ROWS }).flatMap(
  (_, i): FieldConfig[] => [
    { to: `SEAT_${i + 1}_NAME`, from: `seats.${i}.name` },
    { to: `SEAT_${i + 1}_PCT`, from: `seats.${i}.percent` },
    { to: `SEAT_${i + 1}_SEATS`, from: `seats.${i}.seats` },
  ],
);
const SEAT_PATHS: string[] = [
  "VER",
  "ALL",
  ...Array.from({ length: SEAT_ROWS }).flatMap((_, i) => [
    `seats.${i}.name`,
    `seats.${i}.percent`,
    `seats.${i}.seats`,
  ]),
];

/**
 * The panels this app offers in the Configurator's "Add panel" picker. Choosing
 * one prepopulates its id / label / air policy / field mapping + its bindable
 * source paths — the operator only binds a rundown item.
 */
export const PANEL_CATALOG: PanelCatalogEntry[] = [
  {
    panelId: "general-ticker",
    label: "Başkanlık & Genel (Ticker)",
    air: "live",
    fields: tickerFields,
    sourcePaths: TICKER_PATHS,
  },
  {
    panelId: "city-results",
    label: "City / District Results",
    air: "cue",
    select: "activeRegion",
    fields: cityFields,
    sourcePaths: CITY_PATHS,
  },
  {
    panelId: "seats",
    label: "Parliamentary Seats",
    air: "cue",
    fields: seatFields,
    sourcePaths: SEAT_PATHS,
  },
];

export const STARTER_CONFIG: MappingConfig = {
  version: 1,
  server: { baseUrl: `http://${window.location.hostname}:3467` },
  panels: [
    {
      panelId: "general-ticker",
      label: "Başkanlık & Genel (Ticker)",
      rundownId: 0,
      itemId: 0,
      debounceMs: 100,
      // Always on screen — candidates + parties + alliances stream to program.
      air: "live",
      fields: tickerFields,
    },
    {
      panelId: "city-results",
      label: "City / District Results",
      rundownId: 0,
      itemId: 0,
      debounceMs: 100,
      // Full-screen graphic — prepared on city/ilçe selection, committed with
      // VER/ALL (full data flushed to air with the animation).
      air: "cue",
      select: "activeRegion",
      fields: cityFields,
    },
    {
      panelId: "seats",
      label: "Parliamentary Seats",
      rundownId: 0,
      itemId: 0,
      debounceMs: 100,
      // Milletvekilliği — top 5 parties + Others (name / % / seats).
      air: "cue",
      fields: seatFields,
    },
  ],
};
