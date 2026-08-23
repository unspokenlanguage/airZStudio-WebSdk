import { useState } from "react";
import { SEED_PARTIES } from "../config.js";
import type { CityData, RegionData } from "../utils/simulator.js";
import { computeAllianceVotes, type AllianceMap } from "../alliances.js";

interface AllianceOpt { id: string; label: string; color: string }

interface Props {
  cities: CityData[];
  activeCityId: string | null;
  activeDistrictId: string | null;
  onCityChange: (id: string | null) => void;
  onDistrictChange: (id: string | null) => void;
  onVerClick?: () => void;
  onAllClick?: () => void;
  data: CityData | undefined;
  /** Resolve a party display name for the active language. */
  nameFor?: (id: string, fallback: string) => string;
  /** Alliances (id/label/color) + membership map for the "İttifaka Göre" view. */
  alliances?: AllianceOpt[];
  allianceMap?: AllianceMap;
  /** Seats won by each party in the SELECTED CITY (D'Hondt), keyed by party id. */
  citySeats?: Record<string, number>;
  /** Elected MPs in the selected city (top-N of each bölge list). */
  cityWinners?: { party: string; name: string; rank: number; bolge: number }[];
}

export function CityResults({
  cities, activeCityId, activeDistrictId, onCityChange, onDistrictChange,
  onVerClick, onAllClick, data, nameFor, alliances = [], allianceMap = {}, citySeats = {}, cityWinners = [],
}: Props) {
  const [byAlliance, setByAlliance] = useState(false);
  const pname = (id: string, fallback: string) => (nameFor ? nameFor(id, fallback) : fallback);
  const pcolor = (id: string) => SEED_PARTIES.find((p) => p.id === id)?.color ?? "#9aa3ad";
  const ptr = (id: string) => SEED_PARTIES.find((p) => p.id === id)?.name ?? id;

  const currentViewData: RegionData | undefined = activeDistrictId && data
    ? data.districts.find((d) => d.id === activeDistrictId)
    : data;

  const sortedParties = currentViewData
    ? [...SEED_PARTIES].sort((a, b) =>
        (currentViewData.partyVotes[b.id] || 0) - (currentViewData.partyVotes[a.id] || 0))
    : SEED_PARTIES;

  // Alliance votes for the current region, sorted; used by the "İttifaka Göre" view.
  const allianceRows = currentViewData
    ? (() => {
        const v = computeAllianceVotes(currentViewData.partyVotes, allianceMap);
        return alliances
          .map((a) => ({ ...a, votes: v[a.id] || 0 }))
          .sort((x, y) => y.votes - x.votes);
      })()
    : [];

  // Per-city seats: party seats (D'Hondt) + ittifak seats (summed via the map).
  const partySeatRows = Object.entries(citySeats)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, s]) => ({ id, seats: s, name: pname(id, ptr(id)), color: pcolor(id) }));
  const allianceSeatMap: Record<string, number> = {};
  for (const [pid, s] of Object.entries(citySeats)) {
    const aid = allianceMap[pid] ?? "other";
    allianceSeatMap[aid] = (allianceSeatMap[aid] || 0) + s;
  }
  const allianceSeatRows = alliances
    .map((a) => ({ ...a, seats: allianceSeatMap[a.id] || 0 }))
    .filter((a) => a.seats > 0)
    .sort((a, b) => b.seats - a.seats);
  const hasSeats = partySeatRows.length > 0;

  // Elected MPs grouped by party (each list already in bölge+rank order).
  const winnerGroups = (() => {
    const g = new Map<string, string[]>();
    for (const w of cityWinners) {
      if (!g.has(w.party)) g.set(w.party, []);
      g.get(w.party)!.push(w.name);
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length).map(([party, names]) => ({ party, names }));
  })();

  return (
    <div style={S.container}>
      <div style={S.header}>
        <h2 style={S.title}>MİLLETVEKİLİ SEÇİMİ</h2>
        <div style={S.selectors}>
          <div style={S.toggle}>
            <button style={{ ...S.toggleBtn, ...(byAlliance ? S.toggleOn : {}) }} onClick={() => setByAlliance(true)}>İttifaka Göre</button>
            <button style={{ ...S.toggleBtn, ...(!byAlliance ? S.toggleOn : {}) }} onClick={() => setByAlliance(false)}>Partiye Göre</button>
          </div>
          {onVerClick && <button style={S.triggerBtn} onClick={onVerClick}>VER</button>}
          {onAllClick && <button style={S.triggerBtn} onClick={onAllClick}>ALL</button>}
          <select style={S.select} value={activeCityId || ""} onChange={(e) => { onCityChange(e.target.value || null); onDistrictChange(null); }}>
            <option value="">-- Şehir Seç --</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {data && (
            <select style={S.select} value={activeDistrictId || ""} onChange={(e) => onDistrictChange(e.target.value || null)}>
              <option value="">-- İlçe Seç (Tümü) --</option>
              {data.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div style={S.layoutGrid}>
        <div style={S.quickSelect}>
          <h3 style={S.sectionTitle}>Hızlı Seçim</h3>
          <div style={S.cityList}>
            {cities.map((c) => (
              <div key={c.id} style={{ display: "flex", flexDirection: "column" }}>
                <button style={{ ...S.cityBtn, background: activeCityId === c.id && !activeDistrictId ? "rgba(99,102,241,0.2)" : "transparent" }} onClick={() => { onCityChange(c.id); onDistrictChange(null); }}>{c.name}</button>
                {activeCityId === c.id && data && (
                  <div style={S.districtList}>
                    {data.districts.map((d) => (
                      <button key={d.id} style={{ ...S.districtBtn, background: activeDistrictId === d.id ? "rgba(99,102,241,0.2)" : "transparent" }} onClick={() => onDistrictChange(d.id)}>{d.name}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {currentViewData ? (
          <div style={S.content}>
            <div style={S.viewHeader}>
              <h3 style={S.viewTitle}>{currentViewData.name.toLocaleUpperCase("tr-TR")}</h3>
            </div>

            <div style={S.statCards}>
              <div style={S.statCard}><div style={S.statLabel}>Açılan Sandık</div><div style={S.statValue}>%{currentViewData.openBoxRate.toFixed(2)}</div></div>
              <div style={S.statCard}><div style={S.statLabel}>Kullanılan Oy</div><div style={S.statValue}>{currentViewData.totalVotes.toLocaleString()}</div></div>
            </div>

            {/* Per-city MP distribution (province-level; only for a whole city) */}
            {!activeDistrictId && hasSeats && (
              <>
                <h3 style={S.sectionTitle}>MİLLETVEKİLİ DAĞILIMI</h3>
                <div style={S.seatWrap}>
                  {(byAlliance ? allianceSeatRows : partySeatRows).map((r) => (
                    <div key={r.id} style={S.seatChip}>
                      <span style={{ ...S.seatDot, background: r.color }} />
                      <span style={S.seatName}>{"label" in r ? r.label : r.name}</span>
                      <span style={S.seatCount}>{r.seats}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <h3 style={S.sectionTitle}>{byAlliance ? "İTTİFAK SONUÇLARI" : "PARTİ SONUÇLARI"}</h3>
            <div style={S.partyGrid}>
              {byAlliance
                ? allianceRows.map((a) => {
                    const total = allianceRows.reduce((s, x) => s + x.votes, 0);
                    const percent = total > 0 ? (a.votes / total) * 100 : 0;
                    return (
                      <div key={a.id} style={S.partyCard}>
                        <span style={{ ...S.allianceChip, background: a.color }} />
                        <div style={S.partyInfo}>
                          <div style={S.partyHeader}>
                            <span style={S.partyName}>{a.label}</span>
                            <span style={{ ...S.partyPercent, color: a.color }}>%{percent.toFixed(2)}</span>
                          </div>
                          <div style={S.barBg}><div style={{ ...S.bar, width: `${percent}%`, backgroundColor: a.color }} /></div>
                        </div>
                      </div>
                    );
                  })
                : sortedParties.map((p) => {
                    const votes = currentViewData.partyVotes[p.id] || 0;
                    const total = Object.values(currentViewData.partyVotes).reduce((a, b) => a + b, 0);
                    const percent = total > 0 ? (votes / total) * 100 : 0;
                    return (
                      <div key={p.id} style={S.partyCard}>
                        <img src={`/assets/${p.imagePath}`} alt={pname(p.id, p.name)} style={S.partyLogo} />
                        <div style={S.partyInfo}>
                          <div style={S.partyHeader}>
                            <span style={S.partyName}>{pname(p.id, p.name)}</span>
                            <span style={{ ...S.partyPercent, color: p.color }}>%{percent.toFixed(2)}</span>
                          </div>
                          <div style={S.barBg}><div style={{ ...S.bar, width: `${percent}%`, backgroundColor: p.color }} /></div>
                        </div>
                      </div>
                    );
                  })}
            </div>

            {!activeDistrictId && data && (
              <>
                <h3 style={S.sectionTitle}>İLÇE SONUÇLARI (ÖZET)</h3>
                <div style={S.tableContainer}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>İlçe</th>
                        <th style={S.th}>Açılan</th>
                        {byAlliance
                          ? allianceRows.map((a) => <th key={a.id} style={S.th} title={a.label}><span style={{ ...S.allianceChip, background: a.color, margin: "0 auto" }} /></th>)
                          : sortedParties.map((p) => <th key={p.id} style={S.th}><img src={`/assets/${p.imagePath}`} alt={pname(p.id, p.name)} style={{ width: 24, height: 24, objectFit: "contain" }} title={pname(p.id, p.name)} /></th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {data.districts.map((d) => {
                        const av = byAlliance ? computeAllianceVotes(d.partyVotes, allianceMap) : null;
                        const t = Object.values(d.partyVotes).reduce((a, b) => a + b, 0);
                        return (
                          <tr key={d.id} style={S.tr}>
                            <td style={S.td}>{d.name}</td>
                            <td style={S.td}>%{d.openBoxRate.toFixed(1)}</td>
                            {byAlliance
                              ? allianceRows.map((a) => {
                                  const pct = t > 0 ? ((av![a.id] || 0) / t) * 100 : 0;
                                  return <td key={a.id} style={{ ...S.td, color: pct > 30 ? a.color : "#a1a1aa" }}>{pct.toFixed(1)}</td>;
                                })
                              : sortedParties.map((p) => {
                                  const pct = t > 0 ? ((d.partyVotes[p.id] || 0) / t) * 100 : 0;
                                  return <td key={p.id} style={{ ...S.td, color: pct > 30 ? p.color : "#a1a1aa" }}>{pct.toFixed(1)}</td>;
                                })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {!activeDistrictId && winnerGroups.length > 0 && (
              <>
                <h3 style={S.sectionTitle}>KAZANAN MİLLETVEKİLLERİ</h3>
                <div style={S.winWrap}>
                  {winnerGroups.map((g) => (
                    <div key={g.party} style={S.winBlock}>
                      <div style={S.winHead}>
                        <span style={{ ...S.seatDot, background: pcolor(g.party) }} />
                        <span style={S.winParty}>{pname(g.party, ptr(g.party))}</span>
                        <span style={S.seatCount}>{g.names.length}</span>
                      </div>
                      <ol style={S.winList}>
                        {g.names.map((n, i) => <li key={i} style={S.winName}>{n}</li>)}
                      </ol>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={S.emptyState}>Lütfen bir şehir seçin.</div>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  container: { background: "rgba(20, 20, 25, 0.6)", backdropFilter: "blur(12px)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 24, boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 16, flexWrap: "wrap", gap: 12 },
  title: { fontSize: 20, fontWeight: 700, margin: 0, color: "#fff" },
  selectors: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" },
  toggle: { display: "flex", background: "#0e0e13", border: "1px solid #3f3f46", borderRadius: 8, overflow: "hidden" },
  toggleBtn: { background: "transparent", color: "#a1a1aa", border: "none", padding: "8px 12px", fontSize: 13, cursor: "pointer" },
  toggleOn: { background: "#3f3f46", color: "#fff", fontWeight: 700 },
  select: { background: "rgba(0,0,0,0.5)", color: "#fff", border: "1px solid #3f3f46", padding: "8px 16px", borderRadius: 8, fontSize: 14, outline: "none" },
  triggerBtn: { background: "#6366f1", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: "bold", cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.3)" },
  layoutGrid: { display: "grid", gridTemplateColumns: "180px 1fr", gap: 24, alignItems: "start" },
  quickSelect: { display: "flex", flexDirection: "column", gap: 12, height: "600px", borderRight: "1px solid rgba(255,255,255,0.05)" },
  cityList: { display: "flex", flexDirection: "column", overflowY: "auto", paddingRight: 8 },
  cityBtn: { textAlign: "left", padding: "10px 12px", border: "none", color: "#e4e4e7", cursor: "pointer", fontSize: 14, fontWeight: 500, borderRadius: 6, transition: "background 0.2s" },
  districtList: { display: "flex", flexDirection: "column", paddingLeft: 16, marginBottom: 8, gap: 2 },
  districtBtn: { textAlign: "left", padding: "6px 12px", border: "none", color: "#a1a1aa", cursor: "pointer", fontSize: 13, borderRadius: 6, transition: "background 0.2s" },
  content: { display: "flex", flexDirection: "column", gap: 24 },
  viewHeader: { paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.05)" },
  viewTitle: { fontSize: 24, fontWeight: 700, margin: 0, color: "#fff" },
  statCards: { display: "flex", gap: 16 },
  statCard: { flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.05)" },
  statLabel: { fontSize: 12, color: "#a1a1aa", textTransform: "uppercase", marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: 700, color: "#fff" },
  sectionTitle: { fontSize: 14, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 1, margin: 0 },
  seatWrap: { display: "flex", flexWrap: "wrap", gap: 10 },
  seatChip: { display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "8px 12px" },
  seatDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  seatName: { fontSize: 13, color: "#e4e4e7" },
  seatCount: { fontSize: 18, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" },
  winWrap: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  winBlock: { background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 16 },
  winHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.08)" },
  winParty: { fontSize: 14, fontWeight: 700, color: "#fff", flex: 1 },
  winList: { margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 4 },
  winName: { fontSize: 13, color: "#e4e4e7" },
  partyGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  partyCard: { display: "flex", gap: 16, alignItems: "center", background: "rgba(0,0,0,0.2)", padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" },
  partyLogo: { width: 48, height: 48, objectFit: "contain" },
  allianceChip: { width: 20, height: 20, borderRadius: 4, display: "block", flexShrink: 0 },
  partyInfo: { flex: 1, display: "flex", flexDirection: "column", gap: 8 },
  partyHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  partyName: { fontSize: 16, fontWeight: 600, color: "#fff" },
  partyPercent: { fontSize: 18, fontWeight: 700 },
  barBg: { height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" },
  bar: { height: "100%", transition: "width 0.5s ease" },
  tableContainer: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14, textAlign: "center" },
  th: { padding: 12, color: "#a1a1aa", borderBottom: "1px solid rgba(255,255,255,0.1)", fontWeight: 500 },
  tr: { borderBottom: "1px solid rgba(255,255,255,0.05)" },
  td: { padding: 12, color: "#e4e4e7" },
  emptyState: { padding: 40, textAlign: "center", color: "#a1a1aa", fontSize: 16 },
};
