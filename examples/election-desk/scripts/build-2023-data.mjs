// Preprocess the real 2023 parliamentary CSV (party × city × district) into a
// compact JSON the election app drives for AUTHENTIC il/ilçe drill-down.
//
// Input : "Turkey Parliamentary Elections 2023 Data_alliance.xlsx - 2023.csv"
//         columns: Party,City,District,Votes_Pct,Votes,Party Alliance,Presidential Alliance
// Output: src/data/election2023.json
//         { parties:[{id,tr,alliance}], cities:{ <cityId>:{ name, districts:[{id,name,votes:{partyId:n}}] } } }
//
// Run:  node scripts/build-2023-data.mjs "<path-to-csv>"

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = process.argv[2] ??
  resolve(__dirname, "../../Turkey Parliamentary Elections 2023 Data_alliance.xlsx - 2023.csv");
const outPath = resolve(__dirname, "../src/data/election2023.json");

// Stable party ids (align with the app's seed ids where they exist).
const PARTY_ID = {
  "AK Parti": "akp", "CHP": "chp", "MHP": "mhp", "İYİ Parti": "iyi",
  "YEŞİL SOL": "ysp", "YENİDEN REFAH": "yrp", "ZP": "zp", "TİP": "tip",
  "BBP": "bbp", "MEMLEKET": "memleket", "BĞMSZ": "bagimsiz", "GENÇ": "genc",
  "AP": "ap", "SOL PARTI": "solparti", "ANAP": "anap", "TKP": "tkp",
  "VATAN": "vatan", "MP": "mp", "HAKPAR": "hakpar", "AB": "ab",
  "HKP": "hkp", "GBP": "gbp", "MİLLİYOL": "milliyol", "TKH": "tkh", "YP": "yp",
};
const ALLIANCE_ID = {
  "Cumhur": "cumhur", "Millet": "millet", "Emek_ve_Ozgurluk": "emek",
  "Ata": "ata", "Sosyalist_Guc_Birligi": "socialist", "Diger": "other",
};
const slug = (s) => s.trim().toLowerCase()
  .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
  .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
  .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const raw = readFileSync(csvPath, "utf8");
const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
lines.shift(); // header

const partyMeta = new Map();   // id -> { id, tr, alliance }
const cities = {};             // cityId -> { name, districts: Map<distId,{id,name,votes}> }

for (const line of lines) {
  const col = line.split(",");
  if (col.length < 6) continue;
  const [party, city, district, , votesStr, allianceRaw] = col;
  const pid = PARTY_ID[party] ?? slug(party);
  const aid = ALLIANCE_ID[allianceRaw] ?? "other";
  const votes = parseInt(votesStr, 10) || 0;

  if (!partyMeta.has(pid)) partyMeta.set(pid, { id: pid, tr: party, alliance: aid });

  const cityId = slug(city);
  if (!cities[cityId]) cities[cityId] = { name: city, districts: new Map() };
  const distId = slug(district);
  const dmap = cities[cityId].districts;
  if (!dmap.has(distId)) dmap.set(distId, { id: distId, name: district, votes: {} });
  dmap.get(distId).votes[pid] = (dmap.get(distId).votes[pid] || 0) + votes;
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  parties: [...partyMeta.values()],
  cities: Object.fromEntries(
    Object.entries(cities).map(([id, c]) => [
      id,
      { name: c.name, districts: [...c.districts.values()] },
    ]),
  ),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out));

// Summary
const cityCount = Object.keys(out.cities).length;
const distCount = Object.values(out.cities).reduce((n, c) => n + c.districts.length, 0);
const nat = {};
for (const c of Object.values(out.cities))
  for (const d of c.districts)
    for (const [pid, v] of Object.entries(d.votes)) nat[pid] = (nat[pid] || 0) + v;
const total = Object.values(nat).reduce((a, b) => a + b, 0);
console.log(`✓ ${outPath}`);
console.log(`  parties=${out.parties.length} cities=${cityCount} districts=${distCount} total=${total.toLocaleString()}`);
console.log("  top parties:",
  Object.entries(nat).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([id, v]) => `${id} ${(v / total * 100).toFixed(2)}%`).join("  "));
