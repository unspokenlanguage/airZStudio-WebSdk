import { SEED_CANDIDATES } from "../config.js";
import type { NationalData } from "../utils/simulator.js";

interface Props {
  data: NationalData;
}

export function PresidencyTicker({ data }: Props) {
  // Use overall total votes across candidates to calculate percentages
  const totalVotes = data ? Object.values(data.candidateVotes).reduce((a, b) => a + b, 0) : 0;

  return (
    <div style={S.container}>
      <div style={S.header}>
        <h2 style={S.title}>BAŞKANLIK</h2>
        <span style={S.subtitle}>TÜRKİYE GENELİ</span>
        <div style={S.sandikRow}>
          <span>Açılan Sandık</span>
          <strong>%{(data?.openBoxRate || 0).toFixed(2)}</strong>
        </div>
      </div>
      <div style={S.candidatesList}>
        {SEED_CANDIDATES.map((c) => {
          const votes = data?.candidateVotes[c.id] || 0;
          const percent = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
          return (
            <div key={c.id} style={S.candidateCard}>
              <div style={{...S.imageWrapper, borderColor: c.color}}>
                <img src={`/assets/${c.imagePath}`} alt={c.name} style={S.image} />
              </div>
              <div style={S.info}>
                <div style={S.nameRow}>
                  <span style={S.name}>{c.name}</span>
                  <span style={{...S.percent, color: c.color}}>%{percent.toFixed(2)}</span>
                </div>
                <div style={S.progressBarBg}>
                  <div style={{...S.progressBar, width: `${percent}%`, backgroundColor: c.color}} />
                </div>
                <div style={S.votes}>{votes.toLocaleString()} oy</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  container: {
    background: "rgba(20, 20, 25, 0.6)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 20,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
  },
  header: {
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    paddingBottom: 16,
  },
  title: { fontSize: 24, fontWeight: 800, margin: 0, color: "#fff", letterSpacing: 1.5 },
  subtitle: { fontSize: 14, color: "#a1a1aa", textTransform: "uppercase" },
  sandikRow: { display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 14, color: "#e4e4e7" },
  candidatesList: { display: "flex", flexDirection: "column", gap: 16 },
  candidateCard: { display: "flex", alignItems: "center", gap: 16 },
  imageWrapper: {
    width: 64, height: 64, borderRadius: "50%", overflow: "hidden",
    borderWidth: 3, borderStyle: "solid",
    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
    backgroundColor: "#2a2a35",
  },
  image: { width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" },
  info: { flex: 1, display: "flex", flexDirection: "column", gap: 4 },
  nameRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  name: { fontSize: 15, fontWeight: 600, color: "#fff" },
  percent: { fontSize: 18, fontWeight: 700 },
  progressBarBg: { height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" },
  progressBar: { height: "100%", borderRadius: 3, transition: "width 0.5s ease" },
  votes: { fontSize: 12, color: "#a1a1aa", textAlign: "right" }
};
