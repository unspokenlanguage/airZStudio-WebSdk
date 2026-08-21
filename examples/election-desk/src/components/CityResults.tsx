import { SEED_PARTIES } from "../config.js";
import type { CityData, RegionData } from "../utils/simulator.js";

interface Props {
  cities: CityData[];
  activeCityId: string | null;
  activeDistrictId: string | null;
  onCityChange: (id: string | null) => void;
  onDistrictChange: (id: string | null) => void;
  onVerClick?: () => void;
  onAllClick?: () => void;
  data: CityData | undefined;
}

export function CityResults({ cities, activeCityId, activeDistrictId, onCityChange, onDistrictChange, onVerClick, onAllClick, data }: Props) {
  
  const currentViewData: RegionData | undefined = activeDistrictId && data 
    ? data.districts.find(d => d.id === activeDistrictId) 
    : data;

  const sortedParties = currentViewData 
    ? [...SEED_PARTIES].sort((a, b) => {
        const votesA = currentViewData.partyVotes[a.id] || 0;
        const votesB = currentViewData.partyVotes[b.id] || 0;
        return votesB - votesA;
      })
    : SEED_PARTIES;

  return (
    <div style={S.container}>
      <div style={S.header}>
        <h2 style={S.title}>MİLLETVEKİLİ SEÇİMİ</h2>
        <div style={S.selectors}>
          {onVerClick && (
            <button style={S.triggerBtn} onClick={onVerClick}>VER</button>
          )}
          {onAllClick && (
            <button style={S.triggerBtn} onClick={onAllClick}>ALL</button>
          )}
          <select 
            style={S.select} 
            value={activeCityId || ""} 
            onChange={e => {
                onCityChange(e.target.value || null);
                onDistrictChange(null);
            }}
          >
            <option value="">-- Şehir Seç --</option>
            {cities.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {data && (
            <select 
              style={S.select} 
              value={activeDistrictId || ""} 
              onChange={e => onDistrictChange(e.target.value || null)}
            >
              <option value="">-- İlçe Seç (Tümü) --</option>
              {data.districts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div style={S.layoutGrid}>
        {/* Quick Select Sidebar */}
        <div style={S.quickSelect}>
            <h3 style={S.sectionTitle}>Hızlı Seçim</h3>
            <div style={S.cityList}>
                {cities.map(c => (
                    <div key={c.id} style={{display: "flex", flexDirection: "column"}}>
                        <button 
                            style={{...S.cityBtn, background: activeCityId === c.id && !activeDistrictId ? "rgba(99, 102, 241, 0.2)" : "transparent"}}
                            onClick={() => {
                                onCityChange(c.id);
                                onDistrictChange(null);
                            }}
                        >
                            {c.name}
                        </button>
                        {/* If this is the active city, list its districts nested */}
                        {activeCityId === c.id && data && (
                            <div style={S.districtList}>
                                {data.districts.map(d => (
                                    <button 
                                        key={d.id}
                                        style={{...S.districtBtn, background: activeDistrictId === d.id ? "rgba(99, 102, 241, 0.2)" : "transparent"}}
                                        onClick={() => onDistrictChange(d.id)}
                                    >
                                        {d.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>

        {/* Results Panel */}
        {currentViewData ? (
          <div style={S.content}>
            <div style={S.viewHeader}>
                <h3 style={S.viewTitle}>{currentViewData.name.toLocaleUpperCase("tr-TR")}</h3>
            </div>
            
            <div style={S.statCards}>
              <div style={S.statCard}>
                <div style={S.statLabel}>Açılan Sandık</div>
                <div style={S.statValue}>%{currentViewData.openBoxRate.toFixed(2)}</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statLabel}>Toplam Seçmen</div>
                <div style={S.statValue}>{(currentViewData.totalVotes * 1.2).toLocaleString(undefined, {maximumFractionDigits:0})}</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statLabel}>Kullanılan Oy</div>
                <div style={S.statValue}>{currentViewData.totalVotes.toLocaleString()}</div>
              </div>
            </div>

            <h3 style={S.sectionTitle}>PARTİ SONUÇLARI</h3>
            <div style={S.partyGrid}>
              {sortedParties.map(p => {
                const votes = currentViewData.partyVotes[p.id] || 0;
                const total = Object.values(currentViewData.partyVotes).reduce((a, b) => a + b, 0);
                const percent = total > 0 ? (votes / total) * 100 : 0;

                return (
                  <div key={p.id} style={S.partyCard}>
                    <img src={`/assets/${p.imagePath}`} alt={p.name} style={S.partyLogo} />
                    <div style={S.partyInfo}>
                      <div style={S.partyHeader}>
                        <span style={S.partyName}>{p.name}</span>
                        <span style={{...S.partyPercent, color: p.color}}>%{percent.toFixed(2)}</span>
                      </div>
                      <div style={S.barBg}>
                        <div style={{...S.bar, width: `${percent}%`, backgroundColor: p.color}} />
                      </div>
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
                        <th className="th" style={S.th}>Açılan</th>
                        {sortedParties.map(p => (
                        <th key={p.id} style={S.th}><img src={`/assets/${p.imagePath}`} alt={p.name} style={{width: 24, height: 24, objectFit: "contain"}} title={p.name} /></th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {data.districts.map(d => (
                        <tr key={d.id} style={S.tr}>
                        <td style={S.td}>{d.name}</td>
                        <td style={S.td}>%{d.openBoxRate.toFixed(1)}</td>
                        {sortedParties.map(p => {
                            const v = d.partyVotes[p.id] || 0;
                            const t = Object.values(d.partyVotes).reduce((a, b) => a + b, 0);
                            const pct = t > 0 ? (v / t) * 100 : 0;
                            return <td key={p.id} style={{...S.td, color: pct > 30 ? p.color : "#a1a1aa"}}>{pct.toFixed(1)}</td>;
                        })}
                        </tr>
                    ))}
                    </tbody>
                </table>
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
  container: {
    background: "rgba(20, 20, 25, 0.6)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 24,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 16 },
  title: { fontSize: 20, fontWeight: 700, margin: 0, color: "#fff" },
  selectors: { display: "flex", gap: 12 },
  select: {
    background: "rgba(0,0,0,0.5)", color: "#fff", border: "1px solid #3f3f46",
    padding: "8px 16px", borderRadius: 8, fontSize: 14, outline: "none"
  },
  triggerBtn: {
    background: "#6366f1", color: "#fff", border: "none",
    padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: "bold", cursor: "pointer",
    boxShadow: "0 2px 4px rgba(0,0,0,0.3)"
  },
  layoutGrid: { display: "grid", gridTemplateColumns: "180px 1fr", gap: 24, alignItems: "start" },
  quickSelect: {
    display: "flex", flexDirection: "column", gap: 12, height: "600px", borderRight: "1px solid rgba(255,255,255,0.05)"
  },
  cityList: { display: "flex", flexDirection: "column", overflowY: "auto", paddingRight: 8 },
  cityBtn: { 
    textAlign: "left", padding: "10px 12px", border: "none", color: "#e4e4e7", 
    cursor: "pointer", fontSize: 14, fontWeight: 500, borderRadius: 6, transition: "background 0.2s" 
  },
  districtList: { display: "flex", flexDirection: "column", paddingLeft: 16, marginBottom: 8, gap: 2 },
  districtBtn: {
    textAlign: "left", padding: "6px 12px", border: "none", color: "#a1a1aa", 
    cursor: "pointer", fontSize: 13, borderRadius: 6, transition: "background 0.2s" 
  },
  content: { display: "flex", flexDirection: "column", gap: 24 },
  viewHeader: { paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.05)" },
  viewTitle: { fontSize: 24, fontWeight: 700, margin: 0, color: "#fff" },
  statCards: { display: "flex", gap: 16 },
  statCard: {
    flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16,
    border: "1px solid rgba(255,255,255,0.05)"
  },
  statLabel: { fontSize: 12, color: "#a1a1aa", textTransform: "uppercase", marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: 700, color: "#fff" },
  sectionTitle: { fontSize: 14, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 1, margin: 0 },
  partyGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  partyCard: {
    display: "flex", gap: 16, alignItems: "center", background: "rgba(0,0,0,0.2)",
    padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)"
  },
  partyLogo: { width: 48, height: 48, objectFit: "contain" },
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
  emptyState: { padding: 40, textAlign: "center", color: "#a1a1aa", fontSize: 16 }
};
