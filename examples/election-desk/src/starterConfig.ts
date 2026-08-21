import type { FieldConfig, MappingConfig } from "@airz/rundown-sdk";
import { SEED_CANDIDATES, SEED_PARTIES } from "./config.js";

// Map candidates to their respective bindings
const candidateFields: FieldConfig[] = [
  { to: "Headline", from: "headline" },
  ...SEED_CANDIDATES.flatMap((c): FieldConfig[] => [
    { to: c.binding, from: `nationalData.candidateVotes.${c.id}` },
    { to: `${c.binding}_IMG`, from: `candidates.${c.id}.imagePath`, image: true },
  ]),
];

// Map parties to their respective bindings
const cityFields: FieldConfig[] = [
  { to: "Headline", from: "cityHeadline" },
  { to: "City Code", direction: "in", as: "activeCity" },
  ...SEED_PARTIES.flatMap((p): FieldConfig[] => [
    { to: p.binding, from: `partyVotes.${p.id}` },
    { to: `${p.binding}_IMG`, from: `parties.${p.id}.imagePath`, image: true },
  ]),
];

export const STARTER_CONFIG: MappingConfig = {
  version: 1,
  server: { baseUrl: `http://${window.location.hostname}:3467` },
  panels: [
    {
      panelId: "general-ticker",
      label: "General Presidential Ticker",
      rundownId: 0,
      itemId: 0,
      debounceMs: 100,
      fields: [],
    },
    {
      panelId: "city-results",
      label: "City / District Results",
      rundownId: 0,
      itemId: 0,
      debounceMs: 100,
      select: "activeRegion",
      fields: [],
    },
  ],
};
