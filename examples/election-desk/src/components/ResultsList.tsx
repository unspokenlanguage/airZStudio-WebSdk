// A compact "results bar list" for a set of entities (parties or alliances),
// mirroring the PresidencyTicker's look. Sorts by votes and shows a color-chip,
// name, percentage and a progress bar — the operator's on-screen preview of what
// the live ticker graphic is being fed.

interface Entity {
  id: string;
  name: string;
  color: string;
  imagePath?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  entities: Entity[];
  /** Votes keyed by entity id (e.g. nationalData.partyVotes). */
  votes: Record<string, number>;
  openBoxRate?: number;
  /** Resolve a display name (active language) for an entity id. */
  nameFor?: (id: string, fallback: string) => string;
  /** When set, append an aggregated row for everything not in `entities`. */
  otherName?: string;
  /** Render without the card chrome, as a section inside a shared panel. */
  flat?: boolean;
}

export function ResultsList({ title, subtitle, entities, votes, openBoxRate, nameFor, otherName, flat }: Props) {
  const total = Object.values(votes ?? {}).reduce((a, b) => a + b, 0);
  const rows = [...entities]
    .map((e) => {
      const v = votes?.[e.id] ?? 0;
      return {
        ...e,
        name: nameFor ? nameFor(e.id, e.name) : e.name,
        votes: v,
        percent: total > 0 ? (v / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.votes - a.votes);

  if (otherName) {
    const shown = rows.reduce((a, r) => a + r.votes, 0);
    const otherVotes = Math.max(0, total - shown);
    rows.push({
      id: "__other",
      name: otherName,
      color: "#9aa3ad",
      votes: otherVotes,
      percent: total > 0 ? (otherVotes / total) * 100 : 0,
    });
  }

  return (
    <div style={flat ? S.flat : S.container}>
      <div style={S.header}>
        <h2 style={S.title}>{title}</h2>
        {subtitle && <span style={S.subtitle}>{subtitle}</span>}
        {openBoxRate != null && (
          <div style={S.sandikRow}>
            <span>Açılan Sandık</span>
            <strong>%{openBoxRate.toFixed(2)}</strong>
          </div>
        )}
      </div>
      <div style={S.list}>
        {rows.map((r) => (
          <div key={r.id} style={S.row}>
            <span style={{ ...S.chip, backgroundColor: r.color }} />
            <span style={S.name}>{r.name}</span>
            <div style={S.barWrap}>
              <div style={S.barBg}>
                <div style={{ ...S.bar, width: `${r.percent}%`, backgroundColor: r.color }} />
              </div>
            </div>
            <span style={{ ...S.percent, color: r.color }}>%{r.percent.toFixed(1)}</span>
          </div>
        ))}
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
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
  },
  flat: { display: "flex", flexDirection: "column", gap: 14, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" },
  header: { borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: 800, margin: 0, color: "#fff", letterSpacing: 1.2 },
  subtitle: { fontSize: 12, color: "#a1a1aa", textTransform: "uppercase" },
  sandikRow: { display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "#e4e4e7" },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", alignItems: "center", gap: 10 },
  chip: { width: 10, height: 10, borderRadius: 2, flexShrink: 0, boxShadow: "0 0 6px rgba(0,0,0,0.4)" },
  name: { fontSize: 13, fontWeight: 600, color: "#fff", width: 110, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  barWrap: { flex: 1 },
  barBg: { height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" },
  bar: { height: "100%", borderRadius: 3, transition: "width 0.5s ease" },
  percent: { fontSize: 14, fontWeight: 700, width: 52, textAlign: "right", flexShrink: 0 },
};
