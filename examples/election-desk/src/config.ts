// Application Configuration

// `target` = the real 2023 Türkiye result (national vote share %). The simulator
// weights incoming boxes by these, so the live numbers climb toward the real
// 2023 outcome as the open-box rate rises.

export interface Party {
  id: string;
  name: string;
  binding: string;
  color: string;
  imagePath: string; // Relative to the dynamically selected base folder
  /** Real 2023 national vote share (%). */
  target?: number;
  /** Real 2023 parliamentary seats won (only the top 5 are named; the rest fold
   * into "Others" on the seats panel). */
  seats?: number;
}

// 2023 milletvekili (parliamentary) party results, ordered by share.
// `name` is the Turkish default; display text is resolved via labels.ts (EN/TR).
export const SEED_PARTIES: Party[] = [
  { id: "akp", name: "AK Parti", binding: "AKP_Votes", color: "#FF9900", imagePath: "parties/ak-parti.png", target: 35.67, seats: 266 },
  { id: "chp", name: "CHP", binding: "CHP_Votes", color: "#E3000F", imagePath: "parties/chp.png", target: 25.42, seats: 168 },
  { id: "ysp", name: "YEŞİL SOL", binding: "YSP_Votes", color: "#4CAF50", imagePath: "parties/ysp.png", target: 8.85, seats: 62 },
  { id: "mhp", name: "MHP", binding: "MHP_Votes", color: "#8B0000", imagePath: "parties/mhp.png", target: 10.06, seats: 51 },
  { id: "iyi", name: "İYİ Parti", binding: "IYI_Votes", color: "#00AEEF", imagePath: "parties/iyi-parti.png", target: 9.72, seats: 44 },
  { id: "yrp", name: "YENİDEN REFAH", binding: "YRP_Votes", color: "#D32F2F", imagePath: "parties/yrp.png", target: 2.78 },
  { id: "zp", name: "ZP", binding: "ZP_Votes", color: "#1E5AA8", imagePath: "parties/zp.png", target: 2.21 },
  { id: "tip", name: "TİP", binding: "TIP_Votes", color: "#C0142E", imagePath: "parties/tip.png", target: 1.67 },
  { id: "bbp", name: "BBP", binding: "BBP_Votes", color: "#6B1E1E", imagePath: "parties/bbp.png", target: 0.97 },
  { id: "memleket", name: "MEMLEKET", binding: "MEMLEKET_Votes", color: "#17A2B8", imagePath: "parties/memleket.png", target: 0.93 },
];

export interface Candidate {
  id: string;
  name: string;
  binding: string;
  color: string;
  imagePath: string; // Relative to the dynamically selected base folder
  /** Real 2023 first-round vote share (%). */
  target?: number;
}

// 2023 cumhurbaşkanlığı (presidential, 1st round) results.
export const SEED_CANDIDATES: Candidate[] = [
  { id: "erdogan", name: "Recep Tayyip Erdoğan", binding: "RTE_Votes", color: "#FF9900", imagePath: "candidates/erdogan.png", target: 49.52 },
  { id: "kilicdaroglu", name: "Kemal Kılıçdaroğlu", binding: "KK_Votes", color: "#E3000F", imagePath: "candidates/kilicdaroglu.png", target: 44.88 },
  { id: "ogan", name: "Sinan Oğan", binding: "SO_Votes", color: "#546E7A", imagePath: "candidates/ogan.png", target: 5.17 },
  { id: "ince", name: "Muharrem İnce", binding: "MI_Votes", color: "#1976D2", imagePath: "candidates/ince.png", target: 0.43 },
];

export interface Alliance {
  id: string;
  name: string;
  binding: string;
  color: string;
  /** Real 2023 alliance vote share (%). */
  target?: number;
  /** Member party ids (informational). */
  parties?: string[];
}

// 2023 ittifak (alliance) results. Alliances are name-only (no logos).
export const SEED_ALLIANCES: Alliance[] = [
  { id: "cumhur", name: "People's Alliance", binding: "ALLIANCE_1", color: "#FF9900", target: 49.5, parties: ["akp", "mhp", "yrp"] },
  { id: "millet", name: "Nation Alliance", binding: "ALLIANCE_2", color: "#E3000F", target: 35.2, parties: ["chp", "iyi"] },
  { id: "emek", name: "Labour and Freedom", binding: "ALLIANCE_3", color: "#4CAF50", target: 10.5, parties: ["ysp"] },
  { id: "ata", name: "ATA Alliance", binding: "ALLIANCE_4", color: "#00AEEF", target: 2.4 },
  { id: "socialist", name: "Socialist Forces", binding: "ALLIANCE_5", color: "#8B0000", target: 0.3 },
];

// Optional headline binding + an on-air trigger name to demo item.trigger().
export const HEADLINE_BINDING = "Headline";
export const ANIMATE_IN_TRIGGER = "Animate-In";
