// Application Configuration

export interface Party {
  id: string;
  name: string;
  binding: string;
  color: string;
  imagePath: string; // Relative to the dynamically selected base folder
}

export const SEED_PARTIES: Party[] = [
  { id: "akp", name: "AK Parti", binding: "AKP_Votes", color: "#FF9900", imagePath: "parties/ak-parti.png" },
  { id: "chp", name: "CHP", binding: "CHP_Votes", color: "#E3000F", imagePath: "parties/chp.png" },
  { id: "mhp", name: "MHP", binding: "MHP_Votes", color: "#8B0000", imagePath: "parties/mhp.png" },
  { id: "iyi", name: "İYİ Parti", binding: "IYI_Votes", color: "#00AEEF", imagePath: "parties/iyi-parti.png" },
  { id: "ysp", name: "YSP", binding: "YSP_Votes", color: "#4CAF50", imagePath: "parties/ysp.png" },
  { id: "yrp", name: "YRP", binding: "YRP_Votes", color: "#D32F2F", imagePath: "parties/yrp.png" },
];

export interface Candidate {
  id: string;
  name: string;
  binding: string;
  color: string;
  imagePath: string; // Relative to the dynamically selected base folder
}

export const SEED_CANDIDATES: Candidate[] = [
  { id: "erdogan", name: "Recep Tayyip Erdoğan", binding: "RTE_Votes", color: "#FF9900", imagePath: "candidates/erdogan.png" },
  { id: "kilicdaroglu", name: "Kemal Kılıçdaroğlu", binding: "KK_Votes", color: "#E3000F", imagePath: "candidates/kilicdaroglu.png" },
  { id: "ince", name: "Muharrem İnce", binding: "MI_Votes", color: "#1976D2", imagePath: "candidates/ince.png" },
  { id: "ogan", name: "Sinan Oğan", binding: "SO_Votes", color: "#546E7A", imagePath: "candidates/ogan.png" },
];

// Optional headline binding + an on-air trigger name to demo item.trigger().
export const HEADLINE_BINDING = "Headline";
export const ANIMATE_IN_TRIGGER = "Animate-In";
