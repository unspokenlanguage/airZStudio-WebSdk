// Parliamentary seats preview — the top 5 parties + "Others", each with seat
// count and vote %. Mirrors the on-air seats graphic the operator binds.

export interface SeatRow {
  id: string;
  name: string;
  color: string;
  percent: number;
  seats: number;
}

interface Props {
  title: string;
  subtitle?: string;
  totalSeats: number;
  rows: SeatRow[];
}

export function SeatsList({ title, subtitle, totalSeats, rows }: Props) {
  const filled = rows.reduce((a, r) => a + r.seats, 0);
  return (
    <div style={S.container}>
      <div style={S.header}>
        <h2 style={S.title}>{title}</h2>
        {subtitle && <span style={S.subtitle}>{subtitle}</span>}
        <div style={S.totalRow}>
          <span>{filled}</span>
          <strong>/ {totalSeats}</strong>
        </div>
      </div>
      <div style={S.list}>
        {rows.map((r) => (
          <div key={r.id} style={S.row}>
            <span style={{ ...S.chip, backgroundColor: r.color }} />
            <span style={S.name}>{r.name}</span>
            <span style={{ ...S.pct, color: r.color }}>%{r.percent.toFixed(1)}</span>
            <span style={S.seats}>{r.seats}</span>
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
  header: { borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: 800, margin: 0, color: "#fff", letterSpacing: 1.2 },
  subtitle: { fontSize: 12, color: "#a1a1aa", textTransform: "uppercase" },
  totalRow: { display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8, fontSize: 20, fontWeight: 800, color: "#fff", alignItems: "baseline" },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", alignItems: "center", gap: 10 },
  chip: { width: 10, height: 10, borderRadius: 2, flexShrink: 0 },
  name: { fontSize: 13, fontWeight: 600, color: "#fff", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  pct: { fontSize: 13, fontWeight: 700, width: 52, textAlign: "right", flexShrink: 0 },
  seats: { fontSize: 18, fontWeight: 800, color: "#fff", width: 44, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" },
};
