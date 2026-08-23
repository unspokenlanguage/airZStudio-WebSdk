// Build the ilçe → seçim bölgesi (electoral district) join table.
//
// Only 4 provinces are split into multiple bölge (YSK 2023 definition, verified
// against per-bölge seat counts and full ilçe coverage). The other 77 provinces
// are single-district: every ilçe maps to the province itself.
//
// The `bolge` label here is written to MATCH the candidate CSV exactly, so the
// vote CSV can be joined:  vote(city,ilce) → map → bolge,  then aggregate votes
// by (party, city, bolge) and run per-bölge D'Hondt against the candidate lists.
//
// Output columns: city, city_slug, ilce, bolge
//
// Run:  node scripts/build-ilce-bolge-map.mjs [votes.csv] [out.csv]

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VOTES = process.argv[2] ??
  resolve(__dirname, "../../Turkey Parliamentary Elections 2023 Data_alliance.xlsx - 2023.csv");
const OUT = process.argv[3] ?? resolve(__dirname, "../src/data/ilce_bolge_map.csv");

const slug = (s) => s.trim().toLowerCase()
  .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
  .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
  .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ── The only non-trivial part: the 4 split provinces (YSK 2023). ──────────────
// Ilçe names use the EXACT spelling found in the vote CSV.
const SPLITS = {
  "İstanbul": {
    "İstanbul 1. Bölge": ["Adalar", "Ataşehir", "Beykoz", "Çekmeköy", "Kadıköy", "Kartal", "Maltepe", "Pendik", "Sancaktepe", "Sultanbeyli", "Şile", "Tuzla", "Ümraniye", "Üsküdar"],
    "İstanbul 2. Bölge": ["Bayrampaşa", "Beşiktaş", "Beyoğlu", "Esenler", "Eyüpsultan", "Fatih", "Gaziosmanpaşa", "Kağıthane", "Sarıyer", "Sultangazi", "Şişli", "Zeytinburnu"],
    "İstanbul 3. Bölge": ["Arnavutköy", "Avcılar", "Bağcılar", "Bahçelievler", "Bakırköy", "Başakşehir", "Beylikdüzü", "Büyükçekmece", "Çatalca", "Esenyurt", "Güngören", "Küçükçekmece", "Silivri"],
  },
  "Ankara": {
    "Ankara 1. Bölge": ["Bala", "Çankaya", "Elmadağ", "Evren", "Gölbaşı", "Haymana", "Mamak", "Polatlı", "Şereflikoçhisar"],
    "Ankara 2. Bölge": ["Akyurt", "Altındağ", "Çamlıdere", "Çubuk", "Güdül", "Kahramankazan", "Kalecik", "Keçiören", "Kızılcahamam", "Pursaklar"],
    "Ankara 3. Bölge": ["Ayaş", "Beypazarı", "Etimesgut", "Nallıhan", "Sincan", "Yenimahalle"],
  },
  "İzmir": {
    "İzmir 1. Bölge": ["Balçova", "Buca", "Çeşme", "Gaziemir", "Güzelbahçe", "Karabağlar", "Karaburun", "Konak", "Menderes", "Narlıdere", "Seferihisar", "Selçuk", "Torbalı", "Urla"],
    "İzmir 2. Bölge": ["Aliağa", "Bayındır", "Bayraklı", "Bergama", "Beydağ", "Bornova", "Çiğli", "Dikili", "Foça", "Karşıyaka", "Kemalpaşa", "Kınık", "Kiraz", "Menemen", "Ödemiş", "Tire"],
  },
  "Bursa": {
    "Bursa 1. Bölge": ["Büyükorhan", "Karacabey", "Mustafakemalpaşa", "Nilüfer", "Orhaneli", "Osmangazi"],
    "Bursa 2. Bölge": ["Gemlik", "Gürsu", "Harmancık", "İnegöl", "İznik", "Keles", "Kestel", "Mudanya", "Orhangazi", "Yenişehir", "Yıldırım"],
  },
};

// Invert to ilce → bolge per split city.
const splitLookup = {};
for (const [city, bolgeler] of Object.entries(SPLITS)) {
  splitLookup[city] = {};
  for (const [bolge, ilceler] of Object.entries(bolgeler))
    for (const ilce of ilceler) splitLookup[city][ilce] = bolge;
}

// ── Read the distinct (city, ilce) pairs actually present in the vote data. ───
const rows = readFileSync(VOTES, "utf8").split(/\r?\n/).slice(1);
const pairs = new Map(); // "city|ilce" -> {city, ilce}
for (const line of rows) {
  if (!line.trim()) continue;
  const col = line.split(",");
  if (col.length < 3) continue;
  const city = col[1].trim(), ilce = col[2].trim();
  if (!city || !ilce) continue;
  pairs.set(`${city}|${ilce}`, { city, ilce });
}

// ── Assign bölge + validate. ──────────────────────────────────────────────────
const out = [];
const problems = [];
const seenInVotes = {}; // city -> Set(ilce) for split provinces
for (const { city, ilce } of pairs.values()) {
  let bolge;
  if (splitLookup[city]) {
    bolge = splitLookup[city][ilce];
    (seenInVotes[city] ??= new Set()).add(ilce);
    if (!bolge) { problems.push(`UNMAPPED ilçe in vote data: ${city} / ${ilce}`); continue; }
  } else {
    bolge = city; // single-district province
  }
  out.push({ city, city_slug: slug(city), ilce, bolge });
}

// Every ilçe named in a split table must exist in the vote data (typo guard).
for (const [city, byIlce] of Object.entries(splitLookup)) {
  const seen = seenInVotes[city] ?? new Set();
  for (const ilce of Object.keys(byIlce))
    if (!seen.has(ilce)) problems.push(`MAP names an ilçe not in vote data: ${city} / ${ilce}`);
}

out.sort((a, b) =>
  a.city.localeCompare(b.city, "tr") || a.bolge.localeCompare(b.bolge, "tr") ||
  a.ilce.localeCompare(b.ilce, "tr"));

const header = ["city", "city_slug", "ilce", "bolge"];
const lines = [header.join(",")];
for (const r of out) lines.push(header.map((h) => {
  const v = String(r[h]);
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}).join(","));
writeFileSync(OUT, "﻿" + lines.join("\n"), "utf8");

// ── Report. ───────────────────────────────────────────────────────────────────
console.log(`✓ ${OUT}`);
console.log(`  ${out.length} ilçe rows · ${new Set(out.map(r => r.city)).size} provinces`);
for (const city of Object.keys(SPLITS)) {
  const counts = {};
  for (const r of out.filter(r => r.city === city)) counts[r.bolge] = (counts[r.bolge] || 0) + 1;
  console.log(`  ${city}: ` + Object.entries(counts).map(([b, n]) => `${b.replace(city + " ", "")}=${n}`).join(" "));
}
if (problems.length) { console.error("\n✗ VALIDATION PROBLEMS:"); for (const p of problems) console.error("  - " + p); process.exit(1); }
else console.log("\n✓ validation clean: every split-province ilçe mapped, no stray names");
