import { useEffect, useMemo, useRef, useState } from "react";
import {
  configToPanelSpec,
  LinkedItem,
  urlHashConfig,
  panelControls,
  PanelBinder,
  passthroughImages,
  linkingImages,
  saveRemoteConfig,
  discoverAndWatchRemoteConfig,
  validateConfigTargets,
  type AirzClient,
  type MappingConfig,
  type PanelConfig,
  type RundownStream,
} from "@airz/rundown-sdk";
import { AirzConfigurator } from "@airz/config-ui";
import { STARTER_CONFIG } from "./starterConfig.js";
import { useLiveElectionData } from "./utils/simulator.js";
import { CityResults } from "./components/CityResults.js";
import { PresidencyTicker } from "./components/PresidencyTicker.js";
import { SEED_CANDIDATES, SEED_PARTIES } from "./config.js";

const configStore = urlHashConfig("airz.electiondesk.config");

export function App() {
  const [client, setClient] = useState<AirzClient | null>(null);
  const [config, setConfig] = useState<MappingConfig>(() => configStore.load() ?? STARTER_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  
  // The user requested auto upload, but showing progress.
  const [uploadImages, setUploadImages] = useState(true);
  const [syncInterval, setSyncInterval] = useState<number>(5000); // 5 seconds by default
  const [pushing, setPushing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const liveData = useLiveElectionData();

  // Selectors State (driven by AirzConfigurator mappings)
  const [selectors, setSelectors] = useState<Record<string, string>>({
    activeCity: Object.values(liveData.citiesData)[0]?.id ?? "",
    activeDistrict: "",
  });
  const setSelector = (name: string, value: string) => setSelectors((s) => ({ ...s, [name]: value }));

  // Transform simulator data into the generic "feed" object that starterConfig expects
  const feed = useMemo(() => {
    // Calculate total national votes for candidates and parties
    const totalCandidateVotes = Object.values(liveData.nationalData.candidateVotes).reduce((a, b) => a + b, 0);
    const totalPartyVotes = Object.values(liveData.nationalData.partyVotes).reduce((a, b) => a + b, 0);

    // Create sorted arrays of candidates (1st place, 2nd place, etc)
    const sortedCandidates = [...SEED_CANDIDATES].map(c => {
      const votes = liveData.nationalData.candidateVotes[c.id] || 0;
      const percent = totalCandidateVotes > 0 ? (votes / totalCandidateVotes) * 100 : 0;
      return {
        ...c,
        votes,
        percent: percent.toFixed(2),
        // Re-map image path to the local Vite web server path so uploadingImages can fetch it
        imagePath: `${window.location.origin}/assets/${c.imagePath}`
      };
    }).sort((a, b) => b.votes - a.votes);

    // Create sorted arrays of parties
    const sortedParties = [...SEED_PARTIES].map(p => {
      const votes = liveData.nationalData.partyVotes[p.id] || 0;
      const percent = totalPartyVotes > 0 ? (votes / totalPartyVotes) * 100 : 0;
      return {
        ...p,
        votes,
        percent: percent.toFixed(2),
        imagePath: `${window.location.origin}/assets/${p.imagePath}`
      };
    }).sort((a, b) => b.votes - a.votes);

    // Selectors are used here to expose the currently selected region directly
    const activeCityId = selectors.activeCity || null;
    const activeDistrictId = selectors.activeDistrict || null;

    const citiesArray = Object.values(liveData.citiesData).map(city => {
        // Calculate total city votes for candidates and parties
        const cityTotalCandidateVotes = Object.values(city.candidateVotes).reduce((a, b) => a + b, 0);
        const cityTotalPartyVotes = Object.values(city.partyVotes).reduce((a, b) => a + b, 0);

        // Create sorted arrays of candidates for THIS city
        const citySortedCandidates = [...SEED_CANDIDATES].map(c => {
          const votes = city.candidateVotes[c.id] || 0;
          const percent = cityTotalCandidateVotes > 0 ? (votes / cityTotalCandidateVotes) * 100 : 0;
          return {
            ...c,
            votes,
            percent: percent.toFixed(2),
            imagePath: `${window.location.origin}/assets/${c.imagePath}`
          };
        }).sort((a, b) => b.votes - a.votes);

        // Create sorted arrays of parties for THIS city
        const citySortedParties = [...SEED_PARTIES].map(p => {
          const votes = city.partyVotes[p.id] || 0;
          const percent = cityTotalPartyVotes > 0 ? (votes / cityTotalPartyVotes) * 100 : 0;
          return {
            ...p,
            votes,
            percent: percent.toFixed(2),
            imagePath: `${window.location.origin}/assets/${p.imagePath}`
          };
        }).sort((a, b) => b.votes - a.votes);

        const transformedDistricts = city.districts.map(d => {
           const dTotalCand = Object.values(d.candidateVotes).reduce((a, b) => a + b, 0);
           const dTotalParty = Object.values(d.partyVotes).reduce((a, b) => a + b, 0);
           return {
             ...d,
             candidates: [...SEED_CANDIDATES].map(c => {
               const votes = d.candidateVotes[c.id] || 0;
               return { ...c, votes, percent: (dTotalCand > 0 ? (votes/dTotalCand)*100 : 0).toFixed(2), imagePath: `${window.location.origin}/assets/${c.imagePath}` }
             }).sort((a,b) => b.votes - a.votes),
             parties: [...SEED_PARTIES].map(p => {
               const votes = d.partyVotes[p.id] || 0;
               return { ...p, votes, percent: (dTotalParty > 0 ? (votes/dTotalParty)*100 : 0).toFixed(2), imagePath: `${window.location.origin}/assets/${p.imagePath}` }
             }).sort((a,b) => b.votes - a.votes),
             cityHeadline: `${d.name.toLocaleUpperCase('tr-TR')} SEÇİM SONUÇLARI`
           }
        });

        return {
          ...city,
          candidates: citySortedCandidates,
          parties: citySortedParties,
          districts: transformedDistricts,
          cityHeadline: `${city.name.toLocaleUpperCase('tr-TR')} SEÇİM SONUÇLARI`
        };
      });

    let activeRegion = null;
    if (activeCityId) {
      const city = citiesArray.find(c => c.id === activeCityId);
      if (city) {
        if (activeDistrictId) {
          activeRegion = city.districts.find(d => d.id === activeDistrictId) || city;
        } else {
          activeRegion = city;
        }
      }
    }

    return {
      headline: "CUMHURBAŞKANLIĞI SEÇİM SONUÇLARI",
      nationalData: liveData.nationalData,
      candidates: sortedCandidates,
      parties: sortedParties,
      citiesArray,
      activeRegion
    };
  }, [liveData, selectors.activeCity, selectors.activeDistrict]);

  const saveConfig = (next: MappingConfig) => {
    setConfig(next);
    configStore.save(next);
    if (client) {
      saveRemoteConfig(client, "electiondesk", next).catch(e => {
        setErr("Failed to save remote config: " + String(e));
      });
    }
  };

  useEffect(() => {
    if (!client) return;
    const stop = discoverAndWatchRemoteConfig(client, "electiondesk", {
      onConfig: (cfg) => {
        pushLog("✓ remote configuration synced");
        setConfig(cfg);
        configStore.save(cfg);
        validateConfigTargets(client, cfg).then((rows) => {
          const bad = rows.filter((r) => !r.ok && r.reason !== "not configured");
          setErr(
            bad.length
              ? `${bad.length} panel target(s) not on this controller. ` +
                  bad.map((b) => `${b.label ?? b.panelId}: ${b.reason}`).join("; ")
              : null,
          );
        });
      },
    });
    return stop;
  }, [client]);

  const pushLog = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 10));

  const configured = config.panels.filter((p) => p.rundownId && p.itemId);
  const configuredKey = JSON.stringify(configured);
  const selectorsKey = JSON.stringify(selectors);

  // Preserve the upload cache across configuration changes
  const imageResolver = useMemo(() => {
    if (!client) return passthroughImages;
    return uploadImages ? linkingImages(client, { folder: "/Election" }) : passthroughImages;
  }, [client, uploadImages]);

  // Maintain a stable PanelBinder so the diffing engine (BindingSync) persists between 2-second ticks
  const binder = useMemo(() => {
    if (!client) return null;
    const b = new PanelBinder(client, { images: imageResolver });
    for (const pc of configured) {
      b.add(configToPanelSpec(pc, { selectors }));
    }
    return b;
  }, [client, imageResolver, configuredKey, selectorsKey]);

  const pushPanels = async (list: PanelConfig[], feedData: typeof feed = feed) => {
    if (!binder || list.length === 0) return;
    setPushing(true);
    try {
      // Only push the specific panels requested
      await Promise.all(list.map((pc) => binder.updateOne(pc.panelId, feedData)));
      await binder.flush();
    } finally {
      setPushing(false);
    }
  };

  const pushPanelsRef = useRef(pushPanels);
  pushPanelsRef.current = pushPanels;

  const pushAll = async () => {
    if (!client) {
      setErr("Connect first — open ⚙ Configure.");
      return;
    }
    setErr(null);
    try {
      await pushPanels(configured);
      pushLog(`→ pushed ${configured.length} panel(s)`);
    } catch (e) {
      setErr(String(e));
      pushLog(`✕ ${String(e)}`);
    }
  };

  // Connect operator inputs from controller back to our selectors
  const controlIndex = useRef<Map<string, { link: LinkedItem; key: string }>>(new Map());
  const panelsKey = JSON.stringify(
    config.panels.map((p) => [p.panelId, p.rundownId, p.itemId, panelControls(p).map((c) => c.key)]),
  );

  useEffect(() => {
    if (!client) return;
    const links: LinkedItem[] = [];
    const streams: RundownStream[] = [];
    const index = new Map<string, { link: LinkedItem; key: string }>();

    for (const pc of config.panels) {
      const controls = panelControls(pc);
      if (controls.length === 0 || !pc.rundownId || !pc.itemId) continue;
      const stream = client.stream({ rundownId: pc.rundownId });
      const link = new LinkedItem(client, {
        rundownId: pc.rundownId,
        itemId: pc.itemId,
        stream,
        controls: controls.map((c) => c.key),
        onControlChange: (vals, ctx) => {
          for (const { key, as } of controls) {
            const v = vals[key];
            if (v == null || v === "") continue;
            setSelector(as, String(v));
            if (ctx.origin === "remote") pushLog(`◂ controller set ${key}=${v}`);
          }
        },
      });
      for (const c of controls) index.set(c.as, { link, key: c.key });
      links.push(link);
      streams.push(stream);
    }
    controlIndex.current = index;
    return () => {
      links.forEach((l) => l.close());
      streams.forEach((s) => s.close());
      controlIndex.current = new Map();
    };
  }, [client, panelsKey]);

  const onPickSelector = (name: string, value: string) => {
    setSelector(name, value);
    const entry = controlIndex.current.get(name);
    entry?.link.setControl({ [entry.key]: value }).catch((e) => setErr(String(e)));
  };

  // Re-push sliced panels when selection changes
  useEffect(() => {
    if (!client) return;
    const dynamic = configured.filter((p) => (p.selectBy && p.selectBy.length) || p.select);
    if (dynamic.length === 0) return;
    pushPanels(dynamic)
      .then(() => pushLog(`↻ re-sliced ${dynamic.length} panel(s)`))
      .catch((e) => setErr(String(e)));
  }, [selectorsKey, client, panelsKey]);

  // Auto-push on timer
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const configuredRef = useRef(configured);
  configuredRef.current = configured;

  useEffect(() => {
    if (syncInterval === 0 || !client) return;
    const tick = setInterval(() => {
      const list = configuredRef.current;
      if (list.length === 0) return;
      pushPanelsRef.current(list, feedRef.current)
        .then(() => pushLog(`↻ auto-pushed ${list.length} panel(s)`))
        .catch((e) => setErr(String(e)));
    }, syncInterval);
    return () => clearInterval(tick);
  }, [syncInterval, client]);

  const activeCityId = selectors.activeCity || null;
  const activeDistrictId = selectors.activeDistrict || null;
  const currentCityData = activeCityId ? liveData.citiesData[activeCityId] : undefined;

  return (
    <div style={S.page}>
      <header style={S.header}>
        <span style={S.brand}>airZ · Election Desk</span>
        <span style={S.sub}>{client ? "connected" : "not connected"}</span>
        <span style={{ flex: 1 }} />
        {pushing && <span style={S.syncingBadge}>Uploading & Syncing...</span>}
        <button style={S.ghost} onClick={() => {
          configStore.clear();
          window.location.reload();
        }}>
          ↻ Reset Config
        </button>
        <button style={S.ghost} onClick={() => setShowConfig(true)}>
          ⚙ Configure
        </button>
      </header>

      <div style={S.mainGrid}>
        <div style={S.leftSidebar}>
          <div style={S.controlPanel}>
            <h3 style={S.h3}>Controls</h3>
            <label style={S.label}>City (syncs with controller)</label>
            <select
              style={S.input}
              value={selectors.activeCity || ""}
              onChange={(e) => onPickSelector("activeCity", e.target.value)}
            >
              <option value="">-- Şehir Seç --</option>
              {Object.values(liveData.citiesData).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            
            <div style={S.checkRow}>
              <input id="up" type="checkbox" checked={uploadImages} onChange={(e) => setUploadImages(e.target.checked)} />
              <label htmlFor="up" style={{ ...S.sub, cursor: "pointer" }}>
                Auto-upload images to controller
              </label>
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={S.label}>Auto-Sync Frequency</label>
              <select
                style={S.input}
                value={syncInterval}
                onChange={(e) => setSyncInterval(Number(e.target.value))}
              >
                <option value={2000}>Every 2 seconds (Fast)</option>
                <option value={5000}>Every 5 seconds</option>
                <option value={10000}>Every 10 seconds</option>
                <option value={0}>Manual Only</option>
              </select>
            </div>
            
            <button style={{ ...S.btn, opacity: configured.length ? 1 : 0.5 }} disabled={!configured.length || pushing} onClick={pushAll}>
              {pushing ? "Pushing..." : `Push all (${configured.length} panels)`}
            </button>
            {err && <div style={S.error}>{err}</div>}
          </div>

          <div style={S.feedBox}>
             {log.map((l, i) => <div key={i} style={S.feedLine}>{l}</div>)}
          </div>
          
          <PresidencyTicker data={liveData.nationalData} />
        </div>
        <div style={S.mainContent}>
          <CityResults 
            cities={Object.values(liveData.citiesData)}
            activeCityId={activeCityId}
            activeDistrictId={activeDistrictId}
            onCityChange={(id) => onPickSelector("activeCity", id || "")}
            onDistrictChange={(id) => onPickSelector("activeDistrict", id || "")}
            onVerClick={() => {
              const panel = config.panels.find(p => p.panelId === "city-results");
              const field = panel?.fields.find(f => f.from === "VER");
              if (panel?.rundownId && panel?.itemId && field?.to) {
                client?.items.trigger(panel.rundownId, panel.itemId, field.to).catch(e => setErr(String(e)));
              }
            }}
            onAllClick={() => {
              const panel = config.panels.find(p => p.panelId === "city-results");
              const field = panel?.fields.find(f => f.from === "ALL");
              if (panel?.rundownId && panel?.itemId && field?.to) {
                client?.items.trigger(panel.rundownId, panel.itemId, field.to).catch(e => setErr(String(e)));
              }
            }}
            data={currentCityData}
          />
        </div>
      </div>

      <AirzConfigurator
        open={showConfig}
        onClose={() => setShowConfig(false)}
        config={config}
        onChange={saveConfig}
        sourcePaths={[
          "headline",
          "cityHeadline",
          "VER",
          "ALL",
          
          // Candidates (Top 4)
          "candidates.0.name", "candidates.0.votes", "candidates.0.percent", "candidates.0.imagePath",
          "candidates.1.name", "candidates.1.votes", "candidates.1.percent", "candidates.1.imagePath",
          "candidates.2.name", "candidates.2.votes", "candidates.2.percent", "candidates.2.imagePath",
          "candidates.3.name", "candidates.3.votes", "candidates.3.percent", "candidates.3.imagePath",
          
          // Parties (Top 6)
          "parties.0.name", "parties.0.votes", "parties.0.percent", "parties.0.imagePath",
          "parties.1.name", "parties.1.votes", "parties.1.percent", "parties.1.imagePath",
          "parties.2.name", "parties.2.votes", "parties.2.percent", "parties.2.imagePath",
          "parties.3.name", "parties.3.votes", "parties.3.percent", "parties.3.imagePath",
          "parties.4.name", "parties.4.votes", "parties.4.percent", "parties.4.imagePath",
          "parties.5.name", "parties.5.votes", "parties.5.percent", "parties.5.imagePath"
        ]}
        client={client}
        onClient={setClient}
      />
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0a0a0f", color: "#e4e4e7", fontFamily: "Inter, Segoe UI, sans-serif" },
  header: { display: "flex", alignItems: "center", gap: 14, padding: "14px 24px", borderBottom: "1px solid #1c1c22" },
  brand: { fontSize: 15, fontWeight: 700, color: "#a78bfa" },
  sub: { fontSize: 12, color: "#9aa3ad" },
  syncingBadge: { background: "#e8912a", color: "#1a1a1a", padding: "4px 8px", borderRadius: 4, fontSize: 12, fontWeight: "bold" },
  ghost: { background: "#2f353c", color: "#e4e4e7", border: "1px solid #40474f", borderRadius: 6, padding: "7px 12px", fontSize: 13, cursor: "pointer" },
  mainGrid: { display: "grid", gridTemplateColumns: "350px 1fr", gap: 24, padding: 24, alignItems: "start" },
  leftSidebar: { display: "flex", flexDirection: "column", gap: 24 },
  mainContent: { display: "flex", flexDirection: "column", gap: 24 },
  controlPanel: { background: "#141419", border: "1px solid #27272a", borderRadius: 12, padding: 20 },
  h3: { fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#a1a1aa", margin: "0 0 12px" },
  label: { display: "block", fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 0.5, margin: "10px 0 4px" },
  input: { width: "100%", background: "#0e0e13", border: "1px solid #27272a", color: "#e4e4e7", borderRadius: 6, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" },
  btn: { marginTop: 16, width: "100%", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  checkRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 14 },
  error: { marginTop: 12, color: "#ef4444", fontSize: 12 },
  feedBox: { background: "#141419", border: "1px solid #27272a", borderRadius: 12, padding: 12, height: 120, overflowY: "auto", fontSize: 11, fontFamily: "monospace", color: "#a1a1aa" },
  feedLine: { padding: "2px 0", borderBottom: "1px solid #1c1c22" }
};
