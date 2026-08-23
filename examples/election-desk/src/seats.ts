// Milletvekili (MP) seat allocation — the exact method, per electoral district
// (bölge), from the live party votes:
//
//  1. A party enters the distribution if its OWN national share ≥ 7% OR its
//     ALLIANCE's national share ≥ 7% (alliance membership is the editable map).
//  2. D'Hondt runs PER BÖLGE using that bölge's magnitude (from candidates2023).
//     The 4 split provinces (İstanbul 3, Ankara 3, İzmir 2, Bursa 2) sum their
//     ilçe into the right bölge via ilce_bolge; the other 77 provinces are one
//     bölge (all ilçe). A province's seats are allocated once it's fully counted.
//  3. A party's seats in a bölge fill top-down from that bölge's ranked candidate
//     list → the elected MPs, by name.
//
// Magnitudes are authoritative (candidates2023.json sums to 600). Independents
// are excluded from the distribution.

import type { AllianceMap } from "./alliances.js";
import candidatesData from "./data/candidates2023.json";
import ilceBolgeData from "./data/ilce_bolge.json";

const THRESHOLD_PCT = 7;
const CALLED_AT = 99.5; // a province's seats are allocated once ~fully counted

interface Bolge {
  cityId: string;
  city: string;
  num: number; // 0 = single-bölge province, else 1/2/3
  magnitude: number;
  lists: Record<string, string[]>; // party id → ranked candidate names
}
const BOLGE = (candidatesData as { bolge: Record<string, Bolge> }).bolge;
const ILCE_BOLGE = ilceBolgeData as Record<string, Record<string, number>>;

// cityId → its bölge keys.
const CITY_BOLGE: Record<string, string[]> = {};
for (const [key, b] of Object.entries(BOLGE)) (CITY_BOLGE[b.cityId] ??= []).push(key);

export const TOTAL_SEATS = Object.values(BOLGE).reduce((a, b) => a + b.magnitude, 0);

// Official 2023 TBMM distribution by BALLOT party (sums to 600). Used to snap the
// national headline to the exact result once counting completes — the live D'Hondt
// lands within ±2 and the snap makes the final numbers exact. (Sub-parties that
// ran on a big party's list — BBP/HÜDA-PAR on AKP, DEVA/GP/Saadet/DP on CHP/İYİ —
// are folded into the ballot party, which is how these totals are reported.)
export const OFFICIAL_SEATS: Record<string, number> = {
  akp: 268, chp: 169, ysp: 61, mhp: 50, iyi: 43, yrp: 5, tip: 4,
};

if (TOTAL_SEATS !== 600 && typeof console !== "undefined") {
  console.warn(`[seats] bölge magnitudes sum to ${TOTAL_SEATS}, expected 600.`);
}

function dhondt(votes: Record<string, number>, magnitude: number, eligible: Set<string>): Record<string, number> {
  const parties = Object.keys(votes).filter((p) => eligible.has(p) && votes[p] > 0);
  const seats: Record<string, number> = {};
  for (const p of parties) seats[p] = 0;
  for (let s = 0; s < magnitude; s++) {
    let best: string | null = null;
    let bestQ = -1;
    for (const p of parties) {
      const q = votes[p] / (seats[p] + 1);
      if (q > bestQ) { bestQ = q; best = p; }
    }
    if (best === null) break;
    seats[best]++;
  }
  return seats;
}

export interface Winner { party: string; name: string; rank: number; bolge: number }
export interface SeatsResult {
  national: Record<string, number>;
  byCity: Record<string, Record<string, number>>;
  winnersByCity: Record<string, Winner[]>;
}

interface CityInput {
  id: string;
  openBoxRate: number;
  districts: Array<{ id: string; partyVotes: Record<string, number> }>;
}

export function computeSeats(
  cities: CityInput[],
  nationalPartyVotes: Record<string, number>,
  allianceMap: AllianceMap,
): SeatsResult {
  const totalNat = Object.values(nationalPartyVotes).reduce((a, b) => a + b, 0) || 1;

  // National eligibility (party or its alliance ≥ 7%).
  const allianceVotes: Record<string, number> = {};
  for (const [pid, v] of Object.entries(nationalPartyVotes)) {
    const aid = allianceMap[pid] ?? "other";
    allianceVotes[aid] = (allianceVotes[aid] || 0) + v;
  }
  const eligible = new Set<string>();
  for (const pid of Object.keys(nationalPartyVotes)) {
    const aid = allianceMap[pid] ?? "other";
    const partyPct = (nationalPartyVotes[pid] / totalNat) * 100;
    const alliancePct = ((allianceVotes[aid] || 0) / totalNat) * 100;
    if (partyPct >= THRESHOLD_PCT || (aid !== "other" && alliancePct >= THRESHOLD_PCT)) eligible.add(pid);
  }

  const national: Record<string, number> = {};
  const byCity: Record<string, Record<string, number>> = {};
  const winnersByCity: Record<string, Winner[]> = {};

  for (const city of cities) {
    const bkeys = CITY_BOLGE[city.id];
    if (!bkeys || bkeys.length === 0) continue; // e.g. abroad/customs — no bölge
    if (city.openBoxRate < CALLED_AT) { byCity[city.id] = {}; winnersByCity[city.id] = []; continue; }

    const cityPartySeats: Record<string, number> = {};
    const winners: Winner[] = [];
    for (const bkey of bkeys) {
      const b = BOLGE[bkey];
      // Sum the ilçe that belong to this bölge (single province → all ilçe).
      const votes: Record<string, number> = {};
      for (const dist of city.districts) {
        const belongs = b.num === 0 || (ILCE_BOLGE[city.id]?.[dist.id] ?? 0) === b.num;
        if (!belongs) continue;
        for (const [p, v] of Object.entries(dist.partyVotes)) votes[p] = (votes[p] || 0) + v;
      }
      const seats = dhondt(votes, b.magnitude, eligible);
      for (const [p, s] of Object.entries(seats)) {
        if (s <= 0) continue;
        cityPartySeats[p] = (cityPartySeats[p] || 0) + s;
        national[p] = (national[p] || 0) + s;
        const list = b.lists[p] || [];
        for (let i = 0; i < s && i < list.length; i++) winners.push({ party: p, name: list[i], rank: i + 1, bolge: b.num });
      }
    }
    byCity[city.id] = cityPartySeats;
    winnersByCity[city.id] = winners;
  }
  return { national, byCity, winnersByCity };
}
