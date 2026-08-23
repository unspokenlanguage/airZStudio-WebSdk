// Per-bölge D'Hondt seat allocation for the 2023 Turkish parliamentary election.
//
// Pipeline:  votes(city,ilce) --ilce_bolge_map--> bölge
//            aggregate votes by (party, bölge)
//            D'Hondt per bölge over QUALIFYING parties  -> seats per party
//            assign each party's seats to its top-ranked candidates
//
// 2023 rules encoded:
//  • Threshold 7%, applied at the ALLIANCE level: a party enters seat
//    distribution if its alliance cleared 7% nationally (so a small party in a
//    passing alliance still gets seats).
//  • Post-2022 law: NO alliance vote-pooling inside a district — each party runs
//    D'Hondt on its OWN district votes.
//
// Output: src/data/elected_mps.csv  (one row per elected MP)
//
// Run: node scripts/build-dhondt.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const D = (p) => resolve(__dirname, p);
const VOTES = D("../../Turkey Parliamentary Elections 2023 Data_alliance.xlsx - 2023.csv");
const MAP = D("../src/data/ilce_bolge_map.csv");
const CANDS = D("../src/data/candidates2023.csv");
const OUT = D("../src/data/elected_mps.csv");

// Qualifying parties (alliance ≥7% nationally) → candidate-CSV slug + alliance.
const QUALIFY = {
  "AK Parti":      { slug: "akparti",       alliance: "Cumhur" },
  "MHP":           { slug: "mhp",           alliance: "Cumhur" },
  "YENİDEN REFAH": { slug: "yenidenrefah",  alliance: "Cumhur" },
  "BBP":           { slug: "bbp",           alliance: "Cumhur" },
  "CHP":           { slug: "chp",           alliance: "Millet" },
  "İYİ Parti":     { slug: "iyiparti",      alliance: "Millet" },
  "YEŞİL SOL":     { slug: "yesilsolparti", alliance: "Emek ve Özgürlük" },
  "TİP":           { slug: "tip",           alliance: "Emek ve Özgürlük" },
};
const SLUG_META = {}; // slug -> {name, alliance}
for (const [name, m] of Object.entries(QUALIFY)) SLUG_META[m.slug] = { name, alliance: m.alliance };

const splitCSV = (l) => {              // minimal CSV field split (no quoted commas in these files)
  return l.split(",");
};
const readLines = (p) => readFileSync(p, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());

// ── 1. ilce → bölge map ───────────────────────────────────────────────────────
const bolgeOf = {}; // "city|ilce" -> bolge
for (const l of readLines(MAP).slice(1)) {
  const c = splitCSV(l);
  bolgeOf[`${c[0]}|${c[2]}`] = c[3];
}

// ── 2. aggregate qualifying-party votes by bölge ──────────────────────────────
const votes = {}; // "city|bolge" -> { slug -> votes }
const citySlug = {}; // city -> slug (from map, for output)
for (const l of readLines(MAP).slice(1)) { const c = splitCSV(l); citySlug[c[0]] = c[1]; }
for (const l of readLines(VOTES).slice(1)) {
  const c = splitCSV(l);
  if (c.length < 5) continue;
  const q = QUALIFY[c[0]]; if (!q) continue;      // non-qualifying party → excluded
  const bolge = bolgeOf[`${c[1]}|${c[2]}`]; if (!bolge) continue; // overseas/customs → no district
  const key = `${c[1]}|${bolge}`;
  (votes[key] ??= {});
  votes[key][q.slug] = (votes[key][q.slug] || 0) + (parseInt(c[4], 10) || 0);
}

// ── 3. candidate lists + seat counts per bölge ────────────────────────────────
const seats = {};      // "city|bolge" -> seat count
const cands = {};      // "city|bolge" -> { slug -> [ {rank,name}, ... sorted asc ] }
for (const l of readLines(CANDS).slice(1)) {
  const c = splitCSV(l); // party,party_slug,city,city_slug,bolge,rank,name,seats
  const key = `${c[2]}|${c[4]}`;
  seats[key] = parseInt(c[7], 10) || 0;
  (cands[key] ??= {});
  (cands[key][c[1]] ??= []).push({ rank: parseInt(c[5], 10) || 0, name: c[6] });
}
for (const k of Object.keys(cands))
  for (const s of Object.keys(cands[k])) cands[k][s].sort((a, b) => a.rank - b.rank);

// ── 4. D'Hondt per bölge ──────────────────────────────────────────────────────
const elected = [];
const national = {}; // slug -> seats
const seatCheck = {};
for (const key of Object.keys(seats)) {
  const S = seats[key];
  seatCheck[key] = S;
  const v = votes[key] || {};
  // quotient table: for each party, votes/1..S
  const quot = [];
  for (const [slug, vt] of Object.entries(v))
    for (let d = 1; d <= S; d++) quot.push({ slug, q: vt / d });
  quot.sort((a, b) => b.q - a.q || (v[b.slug] - v[a.slug])); // tie → larger raw vote
  const won = {};
  for (let i = 0; i < S && i < quot.length; i++) won[quot[i].slug] = (won[quot[i].slug] || 0) + 1;

  const [city, bolge] = key.split("|");
  for (const [slug, n] of Object.entries(won)) {
    const list = (cands[key]?.[slug]) || [];
    for (let i = 0; i < n; i++) {
      const cand = list[i] || { rank: i + 1, name: "(list exhausted)" };
      elected.push({
        city, city_slug: citySlug[city] || "", bolge, seats: S,
        party: SLUG_META[slug].name, party_slug: slug, alliance: SLUG_META[slug].alliance,
        rank: cand.rank, name: cand.name,
      });
    }
    national[slug] = (national[slug] || 0) + n;
  }
}

// ── 5. write elected MPs ──────────────────────────────────────────────────────
elected.sort((a, b) =>
  a.city.localeCompare(b.city, "tr") || a.bolge.localeCompare(b.bolge, "tr") ||
  a.party.localeCompare(b.party, "tr") || a.rank - b.rank);
const header = ["city", "city_slug", "bolge", "seats", "party", "party_slug", "alliance", "rank", "name"];
const lines = [header.join(",")];
for (const r of elected) lines.push(header.map((h) => {
  const s = String(r[h]); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(","));
writeFileSync(OUT, "﻿" + lines.join("\n"), "utf8");

// ── 6. report ─────────────────────────────────────────────────────────────────
const totalSeats = Object.values(seatCheck).reduce((a, b) => a + b, 0);
const OFFICIAL = { akparti: 268, chp: 169, yesilsolparti: 61, mhp: 50, iyiparti: 43, yenidenrefah: 5, tip: 4, bbp: 0 };
console.log(`✓ ${OUT}`);
console.log(`  ${elected.length} elected MPs across ${Object.keys(seats).length} bölge (seat pool ${totalSeats})\n`);
console.log("  party            model  official*  Δ   alliance");
console.log("  " + "-".repeat(52));
let sum = 0;
for (const [slug, n] of Object.entries(national).sort((a, b) => b[1] - a[1])) {
  sum += n;
  const off = OFFICIAL[slug] ?? "–";
  const d = typeof off === "number" ? (n - off >= 0 ? "+" : "") + (n - off) : "";
  console.log(`  ${SLUG_META[slug].name.padEnd(14)} ${String(n).padStart(5)} ${String(off).padStart(9)}  ${String(d).padStart(3)}  ${SLUG_META[slug].alliance}`);
}
console.log("  " + "-".repeat(52));
console.log(`  model total: ${sum} / ${totalSeats}`);
console.log("\n  *official = seats the main party itself won; alliance partners");
console.log("   (Saadet/DEVA/Gelecek/DP on CHP's list, HÜDA-PAR on AKP's, etc.)");
console.log("   ran on these lists, so the model folds their seats into the host party.");
