// Mock 2023 Türkiye parliamentary dataset — stands in for a live feed.
// City-level Ankara figures are the real "Partiye Göre" totals from the
// reference screenshot; DISTRICT (ilçe) figures below are ILLUSTRATIVE
// placeholders — wire your real per-district feed in their place.

export interface PartyResult {
  party: string;
  percent: number;
  votes: number;
  seats?: number; // vekil sayısı (provincial level)
  logoUrl: string;
}

/** A district (ilçe / county) within a city. */
export interface CountyResult {
  code: string;
  name: string;
  reporting: number;
  parties: PartyResult[];
}

export interface CityResult {
  code: string; // plate code, e.g. "06"
  name: string;
  reporting: number;
  electorate: number; // toplam seçmen
  used: number; // kullanılan oy
  valid: number; // geçerli oy
  parties: PartyResult[];
  counties: CountyResult[];
}

export interface Candidate {
  name: string;
  alliance: string;
  percent: number;
  votes: number;
  photoUrl: string;
}

export interface ElectionData {
  headline: string;
  reporting: number;
  candidates: Candidate[];
  cities: CityResult[];
}

// Illustrative avatar/logo placeholders — swap for your real asset URLs. The
// PanelBinder passes these through, or uploads them to the controller assets.
const img = (seed: string) =>
  `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(seed)}`;

// Party logo lookup so districts reuse the same logo binding values.
const LOGO: Record<string, string> = {
  "AK Parti": img("AKP"),
  CHP: img("CHP"),
  "İYİ Parti": img("IYI"),
  MHP: img("MHP"),
  Zafer: img("ZP"),
  "Yeşil Sol": img("YSP"),
  YRP: img("YRP"),
  BBP: img("BBP"),
};

const p = (party: string, percent: number, votes: number, seats = 0): PartyResult => ({
  party,
  percent,
  votes,
  seats,
  logoUrl: LOGO[party] ?? img(party),
});

// ── Ankara districts (ILLUSTRATIVE splits) ──────────────────────────────────
const ankaraCounties: CountyResult[] = [
  {
    code: "06-cankaya",
    name: "Çankaya",
    reporting: 100,
    parties: [p("CHP", 52.1, 470_000), p("AK Parti", 21.3, 192_000), p("İYİ Parti", 13.2, 119_000)],
  },
  {
    code: "06-kecioren",
    name: "Keçiören",
    reporting: 100,
    parties: [p("AK Parti", 41.8, 330_000), p("CHP", 24.6, 194_000), p("MHP", 12.1, 95_000)],
  },
  {
    code: "06-yenimahalle",
    name: "Yenimahalle",
    reporting: 100,
    parties: [p("CHP", 38.4, 240_000), p("AK Parti", 31.0, 194_000), p("İYİ Parti", 12.9, 80_000)],
  },
  {
    code: "06-mamak",
    name: "Mamak",
    reporting: 100,
    parties: [p("AK Parti", 39.9, 165_000), p("CHP", 30.2, 125_000), p("MHP", 10.8, 44_000)],
  },
  {
    code: "06-etimesgut",
    name: "Etimesgut",
    reporting: 100,
    parties: [p("AK Parti", 34.7, 150_000), p("CHP", 33.9, 146_000), p("İYİ Parti", 14.1, 61_000)],
  },
];

export const ELECTION_2023: ElectionData = {
  headline: "CUMHURBAŞKANI ADAYLARI",
  reporting: 99.9,
  candidates: [
    { name: "Recep Tayyip Erdoğan", alliance: "Cumhur İttifakı", percent: 49.52, votes: 27_133_837, photoUrl: img("RTE") },
    { name: "Kemal Kılıçdaroğlu", alliance: "Millet İttifakı", percent: 44.88, votes: 24_594_932, photoUrl: img("KK") },
    { name: "Sinan Oğan", alliance: "ATA İttifakı", percent: 5.17, votes: 2_831_208, photoUrl: img("SO") },
    { name: "Muharrem İnce", alliance: "Memleket Partisi", percent: 0.43, votes: 236_097, photoUrl: img("Mİ") },
  ],
  cities: [
    {
      code: "06",
      name: "Ankara",
      reporting: 100,
      electorate: 4_416_747,
      used: 4_040_946,
      valid: 3_972_570,
      // Real "Partiye Göre Ankara Genel Durumu" figures from the reference view.
      parties: [
        p("AK Parti", 32.53, 1_292_189, 15),
        p("CHP", 30.56, 1_214_147, 13),
        p("İYİ Parti", 12.8, 508_592, 5),
        p("MHP", 10.25, 407_150, 3),
        p("Zafer", 3.33, 132_220, 0),
        p("Yeşil Sol", 3.15, 125_024, 0),
        p("YRP", 2.67, 106_014, 0),
        p("BBP", 1.27, 50_275, 0),
      ],
      counties: ankaraCounties,
    },
    {
      code: "34",
      name: "İstanbul",
      reporting: 100,
      electorate: 11_400_000,
      used: 10_300_000,
      valid: 10_050_000,
      parties: [
        p("AK Parti", 39.4, 3_650_000, 39),
        p("CHP", 33.1, 3_070_000, 33),
        p("İYİ Parti", 8.2, 760_000, 7),
      ],
      counties: [
        { code: "34-kadikoy", name: "Kadıköy", reporting: 100, parties: [p("CHP", 58.9, 260_000), p("AK Parti", 17.2, 76_000)] },
        { code: "34-fatih", name: "Fatih", reporting: 100, parties: [p("AK Parti", 47.1, 150_000), p("CHP", 29.8, 95_000)] },
      ],
    },
  ],
};

/** Candidate/party source paths, offered to the configurator as autocomplete. */
export const SOURCE_PATHS: string[] = [
  "headline",
  "reporting",
  ...[0, 1, 2, 3].flatMap((n) => [
    `candidates.${n}.name`,
    `candidates.${n}.alliance`,
    `candidates.${n}.percent`,
    `candidates.${n}.votes`,
    `candidates.${n}.photoUrl`,
  ]),
  // City/county panels are sliced at runtime, so their paths are relative:
  "name",
  "code",
  "reporting",
  ...[0, 1, 2].flatMap((n) => [
    `parties.${n}.party`,
    `parties.${n}.percent`,
    `parties.${n}.votes`,
    `parties.${n}.seats`,
    `parties.${n}.logoUrl`,
  ]),
];
