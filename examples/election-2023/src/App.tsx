// 2023 Seçim — visual-config, name-agnostic multi-panel desk.
//
// Nothing about "city"/"county"/"City Code" is special-cased in this component.
// Panels, their slice logic (selectBy), and which bindings are control INPUTS
// all live in the MappingConfig. The app only:
//   • keeps a generic `selectors` map (name → value),
//   • renders its own source data (which it naturally knows) into dropdowns,
//   • pushes result panels one-way and watches control bindings via LinkedItem.
// Swap ELECTION_2023 + the config for any feed and any template — no code change.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  configToPanelSpec,
  LinkedItem,
  urlHashConfig,
  panelControls,
  PanelBinder,
  passthroughImages,
  uploadingImages,
  saveRemoteConfig,
  discoverAndWatchRemoteConfig,
  validateConfigTargets,
  type AirzClient,
  type MappingConfig,
  type PanelConfig,
  type RundownStream,
} from "@airz/rundown-sdk";
import { AirzConfigurator } from "@airz/config-ui";
import { ELECTION_2023, SOURCE_PATHS, type CityResult, type ElectionData } from "./data.js";
import { STARTER_CONFIG } from "./starterConfig.js";

const configStore = urlHashConfig("airz.election2023.config");

export function App() {
  const [config, setConfig] = useState<MappingConfig>(
    () => configStore.load() ?? STARTER_CONFIG,
  );
  const [client, setClient] = useState<AirzClient | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [uploadImages, setUploadImages] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [feed, setFeed] = useState<ElectionData>(ELECTION_2023);

  // Auto-update logic: increment votes every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setFeed((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as ElectionData;
        
        // Randomize candidates
        next.candidates.forEach((c) => {
          c.votes = Math.floor(Math.random() * 30000000);
        });
        const totalVotes = next.candidates.reduce((sum, c) => sum + c.votes, 0);
        next.candidates.forEach((c) => {
          c.percent = (c.votes / totalVotes) * 100;
        });
        next.candidates.sort((a, b) => b.percent - a.percent);

        // Randomize cities and counties
        next.cities.forEach(city => {
          city.parties.forEach(p => {
            p.votes = Math.floor(Math.random() * 1000000);
          });
          const cTotal = city.parties.reduce((sum, p) => sum + p.votes, 0);
          city.parties.forEach(p => {
            p.percent = (p.votes / cTotal) * 100;
          });
          city.parties.sort((a, b) => b.percent - a.percent);

          city.counties.forEach(county => {
            county.parties.forEach(p => {
              p.votes = Math.floor(Math.random() * 100000);
            });
            const kTotal = county.parties.reduce((sum, p) => sum + p.votes, 0);
            county.parties.forEach(p => {
              p.percent = (p.votes / kTotal) * 100;
            });
            county.parties.sort((a, b) => b.percent - a.percent);
          });
        });

        // Add small increment to reporting
        next.reporting = Math.min(100, next.reporting + 0.01);
        
        return next;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Generic selector state. The NAMES (activeCity/activeCounty) come from the
  // config's control fields (`as`); the default VALUES come from the app's data.
  const [selectors, setSelectors] = useState<Record<string, string>>(() => ({
    activeCity: ELECTION_2023.cities[0]!.code,
    activeCounty: ELECTION_2023.cities[0]!.counties[0]?.code ?? "",
  }));
  const setSelector = (name: string, value: string) =>
    setSelectors((s) => ({ ...s, [name]: value }));

  const saveConfig = (next: MappingConfig) => {
    setConfig(next);
    configStore.save(next);
    if (client) {
      saveRemoteConfig(client, "election2023", next).catch(e => {
        setErr("Failed to save remote config: " + String(e));
      });
    }
  };

  // Auto-discover config from the controller on connect, then LIVE-sync changes
  // other machines make. All clients must point at the SAME controller — item
  // IDs are per-database, so a second machine on 127.0.0.1 (its own empty
  // controller) or a different box will discover nothing. We also validate the
  // discovered targets against this controller and surface any mismatch.
  useEffect(() => {
    if (!client) return;
    // Discovers the config now AND keeps syncing — including when another
    // machine saves it after we've already connected.
    const stop = discoverAndWatchRemoteConfig(client, "election2023", {
      onConfig: (cfg) => {
        pushLog("✓ remote configuration synced");
        setConfig(cfg);
        configStore.save(cfg);
        validateConfigTargets(client, cfg).then((rows) => {
          const bad = rows.filter((r) => !r.ok && r.reason !== "not configured");
          setErr(
            bad.length
              ? `${bad.length} panel target(s) not on this controller — are all machines on the same controller IP? ` +
                  bad.map((b) => `${b.label ?? b.panelId}: ${b.reason}`).join("; ")
              : null,
          );
        });
      },
    });
    return stop;
  }, [client]);

  const pushLog = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 30));

  const configured = config.panels.filter((p) => p.rundownId && p.itemId);
  const unconfigured = config.panels.filter((p) => !p.rundownId || !p.itemId);
  const selectorsKey = JSON.stringify(selectors);

  // Push a set of configured panels from the current dataset (one-way, diffed).
  const pushPanels = async (list: PanelConfig[]) => {
    if (!client || list.length === 0) return;
    const binder = new PanelBinder(client, {
      images: uploadImages ? uploadingImages(client, { folder: "/election" }) : passthroughImages,
    });
    for (const pc of list) binder.add(configToPanelSpec(pc, { selectors }));
    await binder.update(feed);
    await binder.flush();
  };

  const pushAll = async () => {
    if (!client) {
      setErr("Connect first — open Configure and sign in.");
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

  // ── Control links (generic): for every panel that declares control inputs,
  // watch them over SSE and mirror their values into `selectors`. A registry
  // maps selector name → the link+key so operator picks can write back. ──
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, panelsKey]);

  // Operator changes a selector here → write its control binding (html→controller).
  const onPickSelector = (name: string, value: string) => {
    setSelector(name, value);
    const entry = controlIndex.current.get(name);
    entry?.link.setControl({ [entry.key]: value }).catch((e) => setErr(String(e)));
  };

  // Synchronous loop: any selector change (operator OR controller-side control
  // edit) re-pushes the panels whose slice depends on selectors.
  // Also pushes when the feed auto-updates.
  useEffect(() => {
    if (!client) return;
    const dynamic = configured.filter((p) => p.selectBy && p.selectBy.length);
    if (dynamic.length === 0) return;
    pushPanels(dynamic)
      .then(() => pushLog(`↻ re-sliced ${dynamic.length} panel(s)`))
      .catch((e) => setErr(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectorsKey, client, panelsKey]);

  // Auto-push ALL configured panels when the live feed ticks.
  useEffect(() => {
    if (!client || configured.length === 0) return;
    pushPanels(configured)
      .then(() => pushLog(`↻ auto-pushed ${configured.length} panel(s)`))
      .catch((e) => setErr(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed]);

  // The app knows its own data → render dropdowns for it. Keep county valid.
  const city =
    feed.cities.find((c) => c.code === selectors.activeCity) ?? feed.cities[0]!;
  useEffect(() => {
    if (!city.counties.some((k) => k.code === selectors.activeCounty)) {
      setSelector("activeCounty", city.counties[0]?.code ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectors.activeCity]);

  return (
    <div style={S.page}>
      <header style={S.header}>
        <span style={S.brand}>airZ · 2023 Seçim</span>
        <span style={S.sub}>{client ? "connected" : "not connected"}</span>
        <span style={{ flex: 1 }} />
        <button style={S.ghost} onClick={() => setShowConfig(true)}>
          ⚙ Configure
        </button>
      </header>

      <div style={S.grid}>
        <section style={S.card}>
          <h2 style={S.h2}>Selectors</h2>
          <label style={S.label}>City (writes its control binding)</label>
          <select
            style={S.input}
            value={selectors.activeCity}
            onChange={(e) => onPickSelector("activeCity", e.target.value)}
          >
            {feed.cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <label style={S.label}>County / ilçe</label>
          <select
            style={S.input}
            value={selectors.activeCounty}
            onChange={(e) => onPickSelector("activeCounty", e.target.value)}
          >
            {city.counties.map((k) => (
              <option key={k.code} value={k.code}>
                {k.name}
              </option>
            ))}
          </select>

          <div style={S.checkRow}>
            <input id="up" type="checkbox" checked={uploadImages} onChange={(e) => setUploadImages(e.target.checked)} />
            <label htmlFor="up" style={{ ...S.sub, cursor: "pointer" }}>
              upload images to controller assets
            </label>
          </div>

          <button style={{ ...S.btn, opacity: configured.length ? 1 : 0.5 }} disabled={!configured.length} onClick={pushAll}>
            Push all ({configured.length} panel{configured.length === 1 ? "" : "s"})
          </button>

          {unconfigured.length > 0 && (
            <div style={S.warn}>
              {unconfigured.length} panel(s) need a target — open ⚙ Configure:
              <br />
              {unconfigured.map((p) => p.label ?? p.panelId).join(", ")}
            </div>
          )}
          {err && <div style={S.error}>{err}</div>}
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>Activity</h2>
          <div style={S.feed}>
            {log.length === 0 && <div style={S.sub}>no pushes yet…</div>}
            {log.map((l, i) => (
              <div key={i} style={S.feedLine}>
                {l}
              </div>
            ))}
          </div>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>Preview</h2>
          <Preview city={city} countyCode={selectors.activeCounty} feed={feed} />
        </section>
      </div>

      <AirzConfigurator
        open={showConfig}
        onClose={() => setShowConfig(false)}
        config={config}
        onChange={saveConfig}
        sourcePaths={SOURCE_PATHS}
        client={client}
        onClient={setClient}
      />
    </div>
  );
}

function Preview({ city, countyCode, feed }: { city: CityResult; countyCode: string; feed: ElectionData }) {
  const county = city.counties.find((k) => k.code === countyCode);
  const gMax = useMemo(() => Math.max(...feed.candidates.map((c) => c.percent)), [feed.candidates]);
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{feed.headline}</div>
      {feed.candidates.slice(0, 4).map((c) => (
        <div key={c.name} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <strong>{c.name}</strong>
            <span style={S.sub}>{c.votes.toLocaleString("tr-TR")}</span>
          </div>
          <div style={S.barTrack}>
            <div style={{ ...S.barFill, width: `${(c.percent / gMax) * 100}%` }}>%{c.percent.toFixed(2)}</div>
          </div>
        </div>
      ))}
      <div style={{ ...S.sub, margin: "14px 0 6px", textTransform: "uppercase", letterSpacing: 1 }}>
        {city.name} → {county?.name ?? "—"}
      </div>
      {(county?.parties ?? city.parties).slice(0, 4).map((pr) => (
        <div key={pr.party} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid #2a2f35" }}>
          <span>{pr.party}</span>
          <span style={S.sub}>
            %{pr.percent.toFixed(1)} · {pr.votes.toLocaleString("tr-TR")}
            {pr.seats ? ` · ${pr.seats} vekil` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#3a4149", color: "#e4e4e7", fontFamily: "Inter, Segoe UI, sans-serif" },
  header: { display: "flex", alignItems: "center", gap: 14, padding: "14px 24px", borderBottom: "1px solid #2a2f35" },
  brand: { fontSize: 15, fontWeight: 700, color: "#fff" },
  sub: { fontSize: 12, color: "#9aa3ad" },
  ghost: { background: "#2f353c", color: "#e4e4e7", border: "1px solid #40474f", borderRadius: 6, padding: "7px 12px", fontSize: 13, cursor: "pointer" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, padding: 24 },
  card: { background: "#2f353c", border: "1px solid #40474f", borderRadius: 12, padding: 20 },
  h2: { fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#c7ccd2", marginBottom: 12 },
  label: { display: "block", fontSize: 11, color: "#9aa3ad", textTransform: "uppercase", letterSpacing: 0.5, margin: "10px 0 4px" },
  input: { width: "100%", background: "#262b30", border: "1px solid #40474f", color: "#e4e4e7", borderRadius: 6, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" },
  btn: { marginTop: 16, width: "100%", background: "#e8912a", color: "#1a1a1a", border: "none", borderRadius: 6, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  checkRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 14 },
  warn: { marginTop: 12, fontSize: 12, color: "#f0c869", background: "rgba(240,200,105,.08)", border: "1px solid rgba(240,200,105,.25)", borderRadius: 6, padding: 8 },
  error: { marginTop: 12, color: "#ff6b6b", fontSize: 12 },
  feed: { maxHeight: 260, overflowY: "auto", fontFamily: "monospace", fontSize: 12 },
  feedLine: { padding: "3px 0", borderBottom: "1px solid #2a2f35", color: "#c7ccd2" },
  barTrack: { background: "#e9edf0", borderRadius: 4, height: 20, overflow: "hidden", marginTop: 2 },
  barFill: { background: "#e8912a", color: "#1a1a1a", height: "100%", display: "flex", alignItems: "center", paddingLeft: 8, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" },
};
