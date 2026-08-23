import { useEffect, useRef, useState } from "react";
import { SEED_CANDIDATES } from "../config.js";
import realData from "../data/election2023.json";

// ── Authentic 2023 data ──────────────────────────────────────────────────────
// Parliamentary party votes are REAL, per il/ilçe (from the official CSV). The
// live simulation reveals each district by raising its open-box rate toward 100%,
// so the numbers climb to the exact real 2023 result. Presidential (candidate)
// figures are the real national 1st-round totals (not in the parliamentary CSV),
// revealed by the national open-box rate; per-region candidate splits are
// approximated from the national lean (no official per-district presidential set).

/** All parties present in the official dataset (id + Turkish name + default
 * alliance) — used by the İttifak configurator to list every movable party. */
export const PARTIES_META: { id: string; tr: string; alliance: string }[] = realData.parties;

const PARTY_ALLIANCE: Record<string, string> = Object.fromEntries(
  realData.parties.map((p) => [p.id, p.alliance]),
);
const PARTY_IDS: string[] = realData.parties.map((p) => p.id);
const ALLIANCE_IDS: string[] = [...new Set(realData.parties.map((p) => p.alliance))];
const CANDIDATE_IDS: string[] = SEED_CANDIDATES.map((c) => c.id);

// Real presidential 1st-round totals (14 May 2023).
const CANDIDATE_TARGET: Record<string, number> = {
  erdogan: 27133837,
  kilicdaroglu: 24594932,
  ogan: 2831208,
  ince: 236097,
};
// Which parliamentary alliances back each presidential candidate (2023). The
// candidate's per-district vote is derived from these alliances' district votes,
// so as regions report at different rates the presidential % SHIFTS regionally
// and over time (instead of being a flat national scaling that never moves). A
// per-candidate factor normalizes the national total to the real 1st-round result.
const CAND_ALLIANCES: Record<string, string[]> = {
  erdogan: ["cumhur"],
  kilicdaroglu: ["millet", "emek", "socialist"],
  ogan: ["ata"],
  ince: ["other"],
};

const zero = (ids: string[]) => ids.reduce((a, id) => ((a[id] = 0), a), {} as Record<string, number>);

// Static real targets (loaded once).
interface DistrictTarget { id: string; name: string; votes: Record<string, number>; total: number }
interface CityTarget { id: string; name: string; districts: DistrictTarget[] }
const CITY_TARGETS: CityTarget[] = Object.entries(realData.cities).map(([id, c]: [string, any]) => ({
  id,
  name: c.name,
  districts: c.districts.map((d: any) => ({
    id: d.id,
    name: d.name,
    votes: d.votes as Record<string, number>,
    total: (Object.values(d.votes) as number[]).reduce((a, b) => a + b, 0),
  })),
}));

// National real alliance totals → per-candidate factor so the alliance-proxy sums
// to the candidate's real presidential total at 100% counted.
const NAT_ALLIANCE_TOTAL: Record<string, number> = {};
for (const c of CITY_TARGETS)
  for (const d of c.districts)
    for (const [p, v] of Object.entries(d.votes)) {
      const a = PARTY_ALLIANCE[p] ?? "other";
      NAT_ALLIANCE_TOTAL[a] = (NAT_ALLIANCE_TOTAL[a] || 0) + v;
    }
const CAND_K: Record<string, number> = {};
for (const cid of Object.keys(CANDIDATE_TARGET)) {
  const proxy = (CAND_ALLIANCES[cid] ?? []).reduce((s, a) => s + (NAT_ALLIANCE_TOTAL[a] || 0), 0);
  CAND_K[cid] = proxy > 0 ? (CANDIDATE_TARGET[cid] || 0) / proxy : 0;
}

// ── Types (unchanged shape for the rest of the app) ──────────────────────────
export interface RegionData {
  id: string;
  name: string;
  openBoxRate: number;
  totalVotes: number;
  candidateVotes: Record<string, number>;
  partyVotes: Record<string, number>;
  allianceVotes: Record<string, number>;
}
export interface CityData extends RegionData {
  districts: RegionData[];
}
export interface NationalData {
  openBoxRate: number;
  totalVotes: number;
  candidateVotes: Record<string, number>;
  partyVotes: Record<string, number>;
  allianceVotes: Record<string, number>;
}
export interface LiveElectionData {
  nationalData: NationalData;
  citiesData: Record<string, CityData>;
}

// Build a full snapshot from per-district open-box rates.
function buildSnapshot(rates: Record<string, Record<string, number>>): LiveElectionData {
  const nat: NationalData = {
    openBoxRate: 0,
    totalVotes: 0,
    candidateVotes: zero(CANDIDATE_IDS),
    partyVotes: zero(PARTY_IDS),
    allianceVotes: zero(ALLIANCE_IDS),
  };
  const citiesData: Record<string, CityData> = {};
  let rateSum = 0;
  let distCount = 0;

  for (const city of CITY_TARGETS) {
    const cityAgg: CityData = {
      id: city.id,
      name: city.name,
      openBoxRate: 0,
      totalVotes: 0,
      candidateVotes: zero(CANDIDATE_IDS),
      partyVotes: zero(PARTY_IDS),
      allianceVotes: zero(ALLIANCE_IDS),
      districts: [],
    };
    let cRateSum = 0;

    for (const d of city.districts) {
      const rate = rates[city.id]?.[d.id] ?? 0;
      const partyVotes: Record<string, number> = {};
      const allianceVotes = zero(ALLIANCE_IDS);
      let dTotal = 0;
      for (const pid of PARTY_IDS) {
        const v = Math.round(((d.votes[pid] || 0) * rate) / 100);
        partyVotes[pid] = v;
        dTotal += v;
        allianceVotes[PARTY_ALLIANCE[pid]] += v;
      }
      // Per-district presidential votes derived from the backing alliances'
      // district votes × the normalizing factor → regionally varied, reveals with
      // the district, and converges to the real 1st-round result at 100%.
      const candidateVotes: Record<string, number> = {};
      for (const cid of CANDIDATE_IDS) {
        const proxy = (CAND_ALLIANCES[cid] ?? []).reduce((s, a) => s + (allianceVotes[a] || 0), 0);
        candidateVotes[cid] = Math.round(CAND_K[cid] * proxy);
      }

      const district: RegionData = {
        id: d.id,
        name: d.name,
        openBoxRate: rate,
        totalVotes: dTotal,
        candidateVotes,
        partyVotes,
        allianceVotes,
      };
      cityAgg.districts.push(district);

      for (const pid of PARTY_IDS) cityAgg.partyVotes[pid] += partyVotes[pid];
      for (const aid of ALLIANCE_IDS) cityAgg.allianceVotes[aid] += allianceVotes[aid];
      for (const cid of CANDIDATE_IDS) cityAgg.candidateVotes[cid] += candidateVotes[cid];
      cityAgg.totalVotes += dTotal;
      cRateSum += rate;
      rateSum += rate;
      distCount++;
    }

    cityAgg.openBoxRate = city.districts.length ? cRateSum / city.districts.length : 0;
    for (const pid of PARTY_IDS) nat.partyVotes[pid] += cityAgg.partyVotes[pid];
    for (const aid of ALLIANCE_IDS) nat.allianceVotes[aid] += cityAgg.allianceVotes[aid];
    for (const cid of CANDIDATE_IDS) nat.candidateVotes[cid] += cityAgg.candidateVotes[cid];
    nat.totalVotes += cityAgg.totalVotes;
    citiesData[city.id] = cityAgg;
  }

  nat.openBoxRate = distCount ? rateSum / distCount : 0;
  return { nationalData: nat, citiesData };
}

export const generateInitialData = (): LiveElectionData => buildSnapshot({});

export function useLiveElectionData() {
  const ratesRef = useRef<Record<string, Record<string, number>>>({});
  const [data, setData] = useState<LiveElectionData>(() => generateInitialData());

  useEffect(() => {
    const interval = setInterval(() => {
      const rates = ratesRef.current;
      // Open a random subset of cities' districts a little more each tick.
      const cityPool = [...CITY_TARGETS].sort(() => 0.5 - Math.random()).slice(0, 20);
      for (const city of cityPool) {
        rates[city.id] ??= {};
        for (const d of city.districts) {
          const cur = rates[city.id][d.id] ?? 0;
          if (cur < 100) rates[city.id][d.id] = Math.min(100, cur + Math.random() * 6);
        }
      }
      setData(buildSnapshot(rates));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return data;
}
