// Bilingual party & alliance names — the CONFIG source of truth for both the web
// UI and the data pushed on air. Seeded with sensible defaults, then editable
// (persisted in localStorage) so a producer can tweak any English/Turkish term
// without touching code. Candidate names are Turkish-only and live in config.ts.

export type Lang = "en" | "tr";
export interface Label { en: string; tr: string }
export interface Labels {
  parties: Record<string, Label>;
  alliances: Record<string, Label>;
}

// Pure acronyms are identical in both languages; full names get English terms.
export const DEFAULT_LABELS: Labels = {
  parties: {
    akp: { en: "AK Party", tr: "AK Parti" },
    chp: { en: "CHP", tr: "CHP" },
    mhp: { en: "MHP", tr: "MHP" },
    iyi: { en: "İYİ Party", tr: "İYİ Parti" },
    ysp: { en: "Green Left Party", tr: "YEŞİL SOL" },
    yrp: { en: "New Welfare Party", tr: "YENİDEN REFAH" },
    zp: { en: "Victory Party", tr: "ZP" },
    tip: { en: "Workers' Party of Turkey", tr: "TİP" },
    bbp: { en: "Great Unity Party", tr: "BBP" },
    memleket: { en: "Homeland Party", tr: "MEMLEKET" },
    bagimsiz: { en: "Independent", tr: "BĞMSZ" },
    genc: { en: "Young Party", tr: "GENÇ" },
    ap: { en: "AP", tr: "AP" },
    solparti: { en: "Left Party", tr: "SOL PARTİ" },
    anap: { en: "Motherland Party", tr: "ANAP" },
    tkp: { en: "TKP", tr: "TKP" },
    vatan: { en: "Patriotic Party", tr: "VATAN" },
    mp: { en: "MP", tr: "MP" },
    hakpar: { en: "HAKPAR", tr: "HAKPAR" },
    ab: { en: "AB", tr: "AB" },
    hkp: { en: "HKP", tr: "HKP" },
    gbp: { en: "GBP", tr: "GBP" },
    milliyol: { en: "National Path", tr: "MİLLİYOL" },
    tkh: { en: "TKH", tr: "TKH" },
    yp: { en: "YP", tr: "YP" },
    other: { en: "Others", tr: "Diğer" },
  },
  alliances: {
    cumhur: { en: "People's Alliance", tr: "Cumhur İttifakı" },
    millet: { en: "Nation Alliance", tr: "Millet İttifakı" },
    emek: { en: "Labour and Freedom Alliance", tr: "Emek ve Özgürlük İttifakı" },
    ata: { en: "ATA Alliance", tr: "ATA İttifakı" },
    socialist: { en: "Socialist Forces", tr: "Sosyalist Güç Birliği" },
    other: { en: "Other", tr: "Diğer" },
  },
};

const KEY = "airz.election.labels";

export function loadLabels(): Labels {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_LABELS);
    const saved = JSON.parse(raw) as Partial<Labels>;
    // Merge saved over defaults so newly added ids always have a fallback.
    return {
      parties: { ...DEFAULT_LABELS.parties, ...(saved.parties ?? {}) },
      alliances: { ...DEFAULT_LABELS.alliances, ...(saved.alliances ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_LABELS);
  }
}

export function saveLabels(labels: Labels): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(labels));
  } catch {
    /* ignore quota / disabled storage */
  }
}

/** Resolve a display name for the active language, falling back to id. */
export function nameOf(
  labels: Labels,
  type: "parties" | "alliances",
  id: string,
  lang: Lang,
  fallback?: string,
): string {
  return labels[type]?.[id]?.[lang] || fallback || id;
}
