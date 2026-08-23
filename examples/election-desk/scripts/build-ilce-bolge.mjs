// Emit the ilçe→bölge map for the 4 split provinces (İstanbul/Ankara/İzmir/Bursa)
// as ilce_bolge.json: { <cityId>: { <ilceId>: bolgeNum } }. Single-bölge provinces
// need no entry (all their ilçe fall in the one bölge). Source: official YSK
// electoral-region grouping. Slug matches the vote dataset (İ-quirk + â→a).

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const slug = (s) => s.trim().toLowerCase()
  .replace(/[âÂ]/g, "a")
  .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
  .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
  .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const MAP = {
  "i-stanbul": {
    1: ["Adalar","Ataşehir","Beykoz","Çekmeköy","Kadıköy","Kartal","Maltepe","Pendik","Sancaktepe","Sultanbeyli","Şile","Tuzla","Ümraniye","Üsküdar"],
    2: ["Bayrampaşa","Beşiktaş","Beyoğlu","Esenler","Eyüpsultan","Fatih","Gaziosmanpaşa","Kâğıthane","Sarıyer","Sultangazi","Şişli","Zeytinburnu"],
    3: ["Arnavutköy","Avcılar","Bağcılar","Bahçelievler","Bakırköy","Başakşehir","Beylikdüzü","Büyükçekmece","Çatalca","Esenyurt","Güngören","Küçükçekmece","Silivri"],
  },
  "ankara": {
    1: ["Balâ","Çankaya","Elmadağ","Evren","Gölbaşı","Haymana","Mamak","Polatlı","Şereflikoçhisar"],
    2: ["Akyurt","Altındağ","Çamlıdere","Çubuk","Güdül","Kahramankazan","Kalecik","Keçiören","Kızılcahamam","Pursaklar"],
    3: ["Ayaş","Beypazarı","Etimesgut","Nallıhan","Sincan","Yenimahalle"],
  },
  "i-zmir": {
    1: ["Balçova","Buca","Çeşme","Gaziemir","Güzelbahçe","Karabağlar","Karaburun","Konak","Menderes","Narlıdere","Seferihisar","Selçuk","Torbalı","Urla"],
    2: ["Aliağa","Bayındır","Bayraklı","Bergama","Beydağ","Bornova","Çiğli","Dikili","Foça","Karşıyaka","Kemalpaşa","Kınık","Kiraz","Menemen","Ödemiş","Tire"],
  },
  "bursa": {
    1: ["Büyükorhan","Karacabey","Mustafakemalpaşa","Nilüfer","Orhaneli","Osmangazi"],
    2: ["Gemlik","Gürsu","Harmancık","İnegöl","İznik","Keles","Kestel","Mudanya","Orhangazi","Yenişehir","Yıldırım"],
  },
};

const out = {};
for (const [cityId, regions] of Object.entries(MAP)) {
  out[cityId] = {};
  for (const [num, names] of Object.entries(regions)) {
    for (const n of names) out[cityId][slug(n)] = Number(num);
  }
}

const outPath = resolve(dirname(fileURLToPath(import.meta.url)), "../src/data/ilce_bolge.json");
writeFileSync(outPath, JSON.stringify(out));
console.log("✓", outPath);
for (const c of Object.keys(out)) console.log(`  ${c}: ${Object.keys(out[c]).length} ilçe`);
