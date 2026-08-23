// Scrape 2023 Turkish parliamentary candidate lists (milletvekili aday listeleri)
// from yenisafak.com into a single CSV: one row per candidate.
//
// Source of truth is the per party×city page, e.g.
//   https://www.yenisafak.com/secim-2023/akparti-istanbul-milletvekili-aday-listeleri
// which returns that party's COMPLETE list for the city (the bare party/city
// pages are paginated at 100 rows, so we avoid them).
//
// Output columns: party, party_slug, city, city_slug, bolge, rank, name, seats
//
// Run:  node scripts/scrape-candidates.mjs [outfile.csv]

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? resolve(__dirname, "../src/data/candidates2023.csv");
const BASE = "https://www.yenisafak.com/secim-2023";
const UA = "Mozilla/5.0 (compatible; election-desk-scraper/1.0)";
const CONCURRENCY = 6;
const RETRIES = 3;

const PARTIES = [
  "akparti", "chp", "mhp", "iyiparti", "yesilsolparti", "yenidenrefah",
  "zaferpartisi", "tip", "memleket", "bbp", "solparti", "tkp", "tkh",
  "vatanpartisi", "milliyol", "gbp", "hakpar", "hkp", "ab", "anap",
  "ap", "gencparti", "millet", "yp", "bagimsiz",
];
const CITIES = [
  "adana", "adiyaman", "afyonkarahisar", "agri", "aksaray", "amasya", "ankara",
  "antalya", "ardahan", "artvin", "aydin", "balikesir", "bartin", "batman",
  "bayburt", "bilecik", "bingol", "bitlis", "bolu", "burdur", "bursa",
  "canakkale", "cankiri", "corum", "denizli", "diyarbakir", "duzce", "edirne",
  "elazig", "erzincan", "erzurum", "eskisehir", "gaziantep", "giresun",
  "gumushane", "hakkari", "hatay", "igdir", "isparta", "istanbul", "izmir",
  "kahramanmaras", "karabuk", "karaman", "kars", "kastamonu", "kayseri",
  "kilis", "kirikkale", "kirklareli", "kirsehir", "kocaeli", "konya", "kutahya",
  "malatya", "manisa", "mardin", "mersin", "mugla", "mus", "nevsehir", "nigde",
  "ordu", "osmaniye", "rize", "sakarya", "samsun", "sanliurfa", "siirt",
  "sinop", "sirnak", "sivas", "tekirdag", "tokat", "trabzon", "tunceli", "usak",
  "van", "yalova", "yozgat", "zonguldak",
];

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
   .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
   .replace(/&([a-z]+);/gi, (_, k) => NAMED[k.toLowerCase()] ?? `&${k};`)
   .replace(/\s+/g, " ")
   .trim();

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function fetchText(url) {
  for (let i = 0; i < RETRIES; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (i === RETRIES - 1) { console.warn(`  ! ${url} -> ${e.message}`); return null; }
      await new Promise((res) => setTimeout(res, 500 * (i + 1)));
    }
  }
}

// Pull the human party/city labels + every candidate row from one page.
const LIST_RE = /<div class="list-party">([^<]*)<\/div>\s*<div class="list-city">([^<]*)<\/div>/;
const ROW_RE =
  /<li class="flex fac">.*?<span>(.*?)<sup>(\d+)<\/sup>.*?<\/span>\s*<span>(.*?)<sup>(\d+)<\/sup>.*?<\/span>\s*<\/li>/gs;

function parsePage(html, partySlug, citySlug) {
  const head = LIST_RE.exec(html);
  const party = head ? decode(head[1]) : partySlug;
  const city = head ? decode(head[2]) : citySlug;
  const rows = [];
  for (const m of html.matchAll(ROW_RE)) {
    const name = decode(m[1].replace(/<[^>]+>/g, ""));
    const rank = +m[2];
    const bolge = decode(m[3].replace(/<[^>]+>/g, ""));
    const seats = +m[4];
    if (!name) continue;
    rows.push({ party, party_slug: partySlug, city, city_slug: citySlug, bolge, rank, name, seats });
  }
  return rows;
}

async function main() {
  const jobs = [];
  for (const p of PARTIES) for (const c of CITIES) jobs.push([p, c]);
  console.log(`Scraping ${jobs.length} party×city pages (concurrency ${CONCURRENCY})…`);

  const all = [];
  let done = 0, withData = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const [p, c] = jobs[cursor++];
      const html = await fetchText(`${BASE}/${p}-${c}-milletvekili-aday-listeleri`);
      done++;
      if (html) {
        const rows = parsePage(html, p, c);
        if (rows.length) { withData++; all.push(...rows); }
      }
      if (done % 100 === 0 || done === jobs.length)
        console.log(`  ${done}/${jobs.length}  (pages with data: ${withData}, rows: ${all.length})`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  all.sort((a, b) =>
    a.city.localeCompare(b.city, "tr") || a.party.localeCompare(b.party, "tr") ||
    a.bolge.localeCompare(b.bolge, "tr") || a.rank - b.rank);

  const header = ["party", "party_slug", "city", "city_slug", "bolge", "rank", "name", "seats"];
  const lines = [header.join(",")];
  for (const r of all) lines.push(header.map((h) => csvCell(r[h])).join(","));
  writeFileSync(OUT, "﻿" + lines.join("\n"), "utf8");

  const parties = new Set(all.map((r) => r.party)).size;
  const cities = new Set(all.map((r) => r.city)).size;
  console.log(`\n✓ ${OUT}`);
  console.log(`  ${all.length} candidates · ${parties} parties · ${cities} cities`);
}

main();
