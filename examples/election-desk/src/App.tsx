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
import { STARTER_CONFIG, PANEL_CATALOG } from "./starterConfig.js";
import { useLiveElectionData, PARTIES_META } from "./utils/simulator.js";
import { CityResults } from "./components/CityResults.js";
import { PresidencyTicker } from "./components/PresidencyTicker.js";
import { ResultsList } from "./components/ResultsList.js";
import { SeatsList } from "./components/SeatsList.js";
import { NamesEditor } from "./components/NamesEditor.js";
import { loadLabels, saveLabels, nameOf, type Lang, type Labels } from "./labels.js";
import { AllianceEditor } from "./components/AllianceEditor.js";
import { loadAllianceMap, saveAllianceMap, computeAllianceVotes, type AllianceMap } from "./alliances.js";
import { computeSeats, TOTAL_SEATS, OFFICIAL_SEATS } from "./seats.js";
import { SEED_CANDIDATES, SEED_PARTIES, SEED_ALLIANCES } from "./config.js";

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

  const [isStaged, setIsStaged] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [labels, setLabels] = useState<Labels>(() => loadLabels());
  const [showNames, setShowNames] = useState(false);
  const [showAlliances, setShowAlliances] = useState(false);
  const [allianceMap, setAllianceMap] = useState<AllianceMap>(() => loadAllianceMap());
  const nameParty = (id: string, fb: string) => nameOf(labels, "parties", id, lang, fb);
  const nameAlliance = (id: string, fb: string) => nameOf(labels, "alliances", id, lang, fb);

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

    // Create sorted arrays of parties (name resolved to the active language)
    const sortedParties = [...SEED_PARTIES].map(p => {
      const votes = liveData.nationalData.partyVotes[p.id] || 0;
      const percent = totalPartyVotes > 0 ? (votes / totalPartyVotes) * 100 : 0;
      return {
        ...p,
        name: nameParty(p.id, p.name),
        votes,
        percent: percent.toFixed(2),
        imagePath: `${window.location.origin}/assets/${p.imagePath}`
      };
    }).sort((a, b) => b.votes - a.votes);

    // Alliance totals are DERIVED LIVE from party votes via the editable
    // membership map — moving a party to another alliance re-tallies instantly.
    const natAllianceVotes = computeAllianceVotes(liveData.nationalData.partyVotes, allianceMap);
    const totalAllianceVotes = Object.values(natAllianceVotes).reduce((a, b) => a + b, 0);
    const sortedAlliances = [...SEED_ALLIANCES].map(a => {
      const votes = natAllianceVotes[a.id] || 0;
      const percent = totalAllianceVotes > 0 ? (votes / totalAllianceVotes) * 100 : 0;
      // Alliances are name-only — no imagePath; name resolved to active language.
      return { ...a, name: nameAlliance(a.id, a.name), votes, percent: percent.toFixed(2) };
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

        // Create sorted arrays of parties for THIS city (name → active language)
        const citySortedParties = [...SEED_PARTIES].map(p => {
          const votes = city.partyVotes[p.id] || 0;
          const percent = cityTotalPartyVotes > 0 ? (votes / cityTotalPartyVotes) * 100 : 0;
          return {
            ...p,
            name: nameParty(p.id, p.name),
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
               return { ...p, name: nameParty(p.id, p.name), votes, percent: (dTotalParty > 0 ? (votes/dTotalParty)*100 : 0).toFixed(2), imagePath: `${window.location.origin}/assets/${p.imagePath}` }
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

    // Id-keyed maps so bindings can resolve an entity's props BY IDENTITY (e.g.
    // a party's static logo) regardless of its current rank in the sorted array.
    const byId = <T extends { id: string }>(arr: T[]) =>
      Object.fromEntries(arr.map((x) => [x.id, x])) as Record<string, T>;
    const candidatesById = byId(sortedCandidates);
    const partiesById = byId(sortedParties);
    const alliancesById = byId(sortedAlliances);

    // Parliamentary seats — computed live via D'Hondt per province from the same
    // votes (allocated as provinces are "called"), so we get real per-city and
    // national seat counts with no seat dataset. Alliance eligibility uses the
    // editable membership map.
    const seatsResult = computeSeats(
      Object.values(liveData.citiesData),
      liveData.nationalData.partyVotes,
      allianceMap,
    );
    const seatColor = (pid: string) => SEED_PARTIES.find((p) => p.id === pid)?.color ?? "#9aa3ad";
    const trName = (pid: string) => PARTIES_META.find((p) => p.id === pid)?.tr ?? pid;
    // National seats display: top 5 parties by seats + Others. Once counting is
    // complete nationally, SNAP to the official totals (the live D'Hondt lands
    // within ±2; this makes the final headline exact).
    const nationallyComplete = liveData.nationalData.openBoxRate >= 99.5;
    const nationalSeats = nationallyComplete ? OFFICIAL_SEATS : seatsResult.national;
    const seatEntries = Object.entries(nationalSeats).sort((a, b) => b[1] - a[1]);
    const TOP_N = 5;
    const otherSeats = seatEntries.slice(TOP_N).reduce((a, [, s]) => a + s, 0);
    const topPct = seatEntries.slice(0, TOP_N).reduce(
      (a, [pid]) => a + (totalPartyVotes > 0 ? (liveData.nationalData.partyVotes[pid] || 0) / totalPartyVotes * 100 : 0),
      0,
    );
    const seats = [
      ...seatEntries.slice(0, TOP_N).map(([pid, s]) => ({
        id: pid,
        name: nameParty(pid, trName(pid)),
        color: seatColor(pid),
        percent: totalPartyVotes > 0 ? (liveData.nationalData.partyVotes[pid] || 0) / totalPartyVotes * 100 : 0,
        seats: s,
      })),
      {
        id: "other",
        name: nameParty("other", lang === "tr" ? "Diğer" : "Others"),
        color: "#9aa3ad",
        percent: Math.max(0, 100 - topPct),
        seats: otherSeats,
      },
    ];

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
      // Override alliance votes with the config-derived tally (party votes are
      // real; the alliance grouping follows the editable membership map).
      nationalData: { ...liveData.nationalData, allianceVotes: natAllianceVotes },
      candidates: sortedCandidates,
      parties: sortedParties,
      alliances: sortedAlliances,
      // Identity-keyed lookups (for images/names that shouldn't depend on rank).
      candidatesById,
      partiesById,
      alliancesById,
      seats,
      totalSeats: TOTAL_SEATS,
      citySeats: seatsResult.byCity,
      cityWinners: seatsResult.winnersByCity,
      citiesArray,
      // The selected region, enriched with partiesById (logo resolution) and a
      // config-derived alliance tally for its own votes.
      activeRegion: activeRegion
        ? {
            ...activeRegion,
            partiesById,
            allianceVotes: computeAllianceVotes(activeRegion.partyVotes, allianceMap),
          }
        : null,
    };
  }, [liveData, selectors.activeCity, selectors.activeDistrict, lang, labels, allianceMap]);

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
    // Per-panel air policy (cue vs live) comes from each panel's config; the
    // Rehearse ↔ On-Air toggle sets the binder's on-air state. Data destination
    // is derived per write from those two.
    const b = new PanelBinder(client, { images: imageResolver });
    b.setOnAir(!isStaged);
    for (const pc of configured) {
      b.add(configToPanelSpec(pc, { selectors }));
    }
    return b;
  }, [client, imageResolver, configuredKey, selectorsKey, isStaged]);

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

  const takeToAir = async () => {
    if (!client) {
      setErr("Connect first — open ⚙ Configure.");
      return;
    }
    setErr(null);
    setPushing(true);
    try {
      await Promise.all(configured.map(p => client.items.pushStaged(p.rundownId!, p.itemId!)));
      pushLog(`→ taken to air ${configured.length} panel(s)`);
    } catch (e) {
      setErr(String(e));
      pushLog(`✕ ${String(e)}`);
    } finally {
      setPushing(false);
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

  // Fire a trigger on a configured panel by its source name (VER/ALL), resolving
  // the trigger's binding key from the panel's field map, falling back to the
  // literal name. Routed through binder.take so it respects staged/on-air + air
  // policy (a live ticker: take-on-air, then streams; a cue panel: flush + fire).
  const firePanelTrigger = (panelId: string, from: string) => {
    const p = config.panels.find((x) => x.panelId === panelId);
    if (!p) {
      setErr(`Add the "${panelId}" panel in Configure first.`);
      return;
    }
    const trig = p.fields.find((f) => f.from === from)?.to ?? from;
    binder?.take(panelId, trig).catch((e) => setErr(String(e)));
  };

  return (
    <div style={S.page}>
      <header style={S.header}>
        <span style={S.brand}>airZ · Election Desk</span>
        <span style={S.sub}>{client ? "connected" : "not connected"}</span>
        <span style={{ flex: 1 }} />
        
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: isStaged ? '#facc15' : '#aaa', fontWeight: 'bold', marginRight: '16px' }}>
          <input 
            type="checkbox" 
            checked={isStaged} 
            onChange={e => setIsStaged(e.target.checked)} 
          />
          STAGED MODE
        </label>
        
        {isStaged && (
          <button style={{ ...S.ghost, backgroundColor: '#dc2626', color: 'white', fontWeight: 'bold', marginRight: '16px' }} onClick={takeToAir} disabled={pushing}>
            TAKE TO AIR
          </button>
        )}
        {pushing && <span style={S.syncingBadge}>Uploading & Syncing...</span>}
        <button
          style={{ ...S.ghost, fontWeight: 700, marginRight: 8 }}
          onClick={() => setLang((l) => (l === "en" ? "tr" : "en"))}
          title="Toggle English / Türkçe (affects the UI and the names pushed on air)"
        >
          {lang === "en" ? "🇬🇧 EN" : "🇹🇷 TR"}
        </button>
        <button style={S.ghost} onClick={() => setShowNames(true)} title="Edit party & alliance names">
          ✎ Names
        </button>
        <button style={S.ghost} onClick={() => setShowAlliances(true)} title="Reassign parties to alliances (re-tallies live)">
          🤝 İttifak
        </button>
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
          
          {/* One panel: presidency + parliamentary + alliances all feed the
              general-ticker item, so they read as a single card. */}
          <div style={S.panelGroup}>
            <div style={S.panelGroupHead}>
              <span style={S.panelGroupTitle}>
                {lang === "tr" ? "BAŞKANLIK & GENEL" : "PRESIDENCY & PARLIAMENT"}
              </span>
              <span style={S.panelGroupTag}>general-ticker</span>
              <span style={{ flex: 1 }} />
              <button style={S.headBtn} onClick={() => firePanelTrigger("general-ticker", "VER")} title="Take/advance (VER)">VER</button>
              <button style={S.headBtn} onClick={() => firePanelTrigger("general-ticker", "ALL")} title="Take/advance (ALL)">ALL</button>
            </div>

            <PresidencyTicker data={liveData.nationalData} flat />

            <ResultsList
              title={lang === "tr" ? "GENEL SEÇİM" : "PARLIAMENTARY"}
              subtitle="Milletvekili · Türkiye Geneli"
              entities={SEED_PARTIES}
              votes={liveData.nationalData.partyVotes}
              openBoxRate={liveData.nationalData.openBoxRate}
              nameFor={nameParty}
              otherName={lang === "tr" ? "Diğer" : "Others"}
              flat
            />

            <ResultsList
              title={lang === "tr" ? "İTTİFAKLAR" : "ALLIANCES"}
              subtitle="Türkiye Geneli"
              entities={SEED_ALLIANCES}
              votes={feed.nationalData.allianceVotes}
              openBoxRate={liveData.nationalData.openBoxRate}
              nameFor={nameAlliance}
              otherName={lang === "tr" ? "Diğer" : "Other"}
              flat
            />
          </div>

          <SeatsList
            title={lang === "tr" ? "MİLLETVEKİLLİĞİ" : "PARLIAMENTARY SEATS"}
            subtitle="600"
            totalSeats={feed.totalSeats}
            rows={feed.seats}
          />
        </div>
        <div style={S.mainContent}>
          <CityResults
            cities={Object.values(liveData.citiesData)}
            nameFor={nameParty}
            alliances={SEED_ALLIANCES.map((a) => ({ id: a.id, label: nameAlliance(a.id, a.name), color: a.color }))}
            allianceMap={allianceMap}
            citySeats={activeCityId ? (feed.citySeats[activeCityId] ?? {}) : {}}
            cityWinners={activeCityId ? (feed.cityWinners[activeCityId] ?? []) : []}
            activeCityId={activeCityId}
            activeDistrictId={activeDistrictId}
            onCityChange={(id) => onPickSelector("activeCity", id || "")}
            onDistrictChange={(id) => onPickSelector("activeDistrict", id || "")}
            onVerClick={() => {
              const panel = config.panels.find(p => p.panelId === "city-results");
              const field = panel?.fields.find(f => f.from === "VER");
              if (panel && field?.to) {
                // take(): cue → flush full prepared data + fire → program (On-Air)
                // or preview (Rehearse); live panel → just fires.
                binder?.take("city-results", field.to).catch(e => setErr(String(e)));
              }
            }}
            onAllClick={() => {
              const panel = config.panels.find(p => p.panelId === "city-results");
              const field = panel?.fields.find(f => f.from === "ALL");
              if (panel && field?.to) {
                binder?.take("city-results", field.to).catch(e => setErr(String(e)));
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
        panelCatalog={PANEL_CATALOG}
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

      <NamesEditor
        open={showNames}
        onClose={() => setShowNames(false)}
        labels={labels}
        parties={SEED_PARTIES.map((p) => ({ id: p.id, tr: p.name }))}
        alliances={SEED_ALLIANCES.map((a) => ({ id: a.id, tr: a.name }))}
        onChange={(next) => {
          setLabels(next);
          saveLabels(next);
        }}
      />

      <AllianceEditor
        open={showAlliances}
        onClose={() => setShowAlliances(false)}
        map={allianceMap}
        parties={PARTIES_META.map((p) => ({
          id: p.id,
          name: nameParty(p.id, p.tr),
          color: SEED_PARTIES.find((s) => s.id === p.id)?.color,
        }))}
        alliances={SEED_ALLIANCES.map((a) => ({
          id: a.id,
          label: nameAlliance(a.id, a.name),
          color: a.color,
        }))}
        onChange={(next) => {
          setAllianceMap(next);
          saveAllianceMap(next);
        }}
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
  airBtn: { flex: 1, background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  panelGroup: { background: "rgba(20,20,25,0.6)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" },
  panelGroupHead: { display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: 4 },
  panelGroupTitle: { fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: 0.5 },
  panelGroupTag: { fontSize: 10, color: "#a78bfa", background: "rgba(167,139,250,0.12)", padding: "2px 8px", borderRadius: 10, fontFamily: "monospace" },
  headBtn: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  checkRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 14 },
  error: { marginTop: 12, color: "#ef4444", fontSize: 12 },
  feedBox: { background: "#141419", border: "1px solid #27272a", borderRadius: 12, padding: 12, height: 120, overflowY: "auto", fontSize: 11, fontFamily: "monospace", color: "#a1a1aa" },
  feedLine: { padding: "2px 0", borderBottom: "1px solid #1c1c22" }
};
