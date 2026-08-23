// Party → alliance membership as EDITABLE config. Alliance vote totals are
// derived live from party votes using THIS map, so re-assigning a party to
// another alliance (a last-minute change) instantly re-tallies every alliance's
// votes and percentages from the same simulator data — zero recompute plumbing.

import realData from "./data/election2023.json";

export type AllianceMap = Record<string, string>; // partyId -> allianceId

// Default membership straight from the official 2023 dataset.
export const DEFAULT_ALLIANCE_MAP: AllianceMap = Object.fromEntries(
  realData.parties.map((p) => [p.id, p.alliance]),
);

const KEY = "airz.election.allianceMap";

export function loadAllianceMap(): AllianceMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_ALLIANCE_MAP };
    // Merge saved over defaults so any party missing from a saved map still maps.
    return { ...DEFAULT_ALLIANCE_MAP, ...(JSON.parse(raw) as AllianceMap) };
  } catch {
    return { ...DEFAULT_ALLIANCE_MAP };
  }
}

export function saveAllianceMap(map: AllianceMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Tally alliance votes from party votes using the current membership map. */
export function computeAllianceVotes(
  partyVotes: Record<string, number>,
  map: AllianceMap,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [pid, v] of Object.entries(partyVotes)) {
    const aid = map[pid] ?? "other";
    out[aid] = (out[aid] || 0) + v;
  }
  return out;
}
