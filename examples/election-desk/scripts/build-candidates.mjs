// Preprocess candidates2023.csv → candidates2023.json: per electoral district
// (bölge) the seat magnitude + each party's RANKED candidate list. Used to name
// the winners (top-N of a party's bölge list = its elected MPs there).
//
// Input columns: party,party_slug,city,city_slug,bolge,rank,name,seats
// Output: { bolge: { <key>: { cityId, city, num, magnitude, lists:{ <partyId>:[name..] } } } }
//   key = cityId (single-bölge province) or `${cityId}-${num}` (split province).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = process.argv[2] ?? resolve(__dirname, "../src/data/candidates2023.csv");
const outPath = resolve(__dirname, "../src/data/candidates2023.json");

// candidate party_slug → our data/party id (must match election2023.json ids).
const SLUG2ID = {
  ab: "ab", akparti: "akp", anap: "anap", ap: "ap", bbp: "bbp",
  bagimsiz: "bagimsiz", chp: "chp", gbp: "gbp", gencparti: "genc",
  hakpar: "hakpar", hkp: "hkp", mhp: "mhp", memleket: "memleket",
  milliyol: "milliyol", millet: "millet_party", solparti: "solparti",
  tkh: "tkh", tkp: "tkp", tip: "tip", vatanpartisi: "vatan",
  yenidenrefah: "yrp", yesilsolparti: "ysp", yp: "yp", zaferpartisi: "zp",
  iyiparti: "iyi",
};

// Same slug as the vote dataset (keeps İ-quirk: "İstanbul" → "i-stanbul").
const slug = (s) => s.trim().toLowerCase()
  .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
  .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
  .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const raw = readFileSync(csvPath, "utf8").replace(/^﻿/, "");
const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
lines.shift();

const bolge = {};
for (const line of lines) {
  const c = line.split(",");
  if (c.length < 8) continue;
  const [, partySlug, city, , bolgeLabel, rank, name, seats] = c;
  const pid = SLUG2ID[partySlug.trim()];
  if (!pid) continue;
  const cityId = slug(city);
  const m = bolgeLabel.match(/(\d+)\.\s*Bölge/);
  const num = m ? parseInt(m[1], 10) : 0;
  const key = num > 0 ? `${cityId}-${num}` : cityId;
  if (!bolge[key]) bolge[key] = { cityId, city: city.trim(), num, magnitude: parseInt(seats, 10) || 0, lists: {} };
  (bolge[key].lists[pid] ??= []).push({ rank: parseInt(rank, 10) || 999, name: name.trim() });
}
// sort each list by rank, keep names only
for (const b of Object.values(bolge)) {
  for (const pid of Object.keys(b.lists)) {
    b.lists[pid] = b.lists[pid].sort((a, z) => a.rank - z.rank).map((x) => x.name);
  }
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ bolge }));

const keys = Object.keys(bolge);
const totalMag = keys.reduce((a, k) => a + bolge[k].magnitude, 0);
const split = keys.filter((k) => bolge[k].num > 0);
console.log(`✓ ${outPath}`);
console.log(`  bölge: ${keys.length}  total seats: ${totalMag}  split-province bölge: ${split.length} (${split.join(", ")})`);
