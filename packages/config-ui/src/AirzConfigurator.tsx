// <AirzConfigurator> — a mountable overlay that lets an operator configure the
// SDK visually: controller URL + login, then per PANEL pick a rundown + item,
// auto-load that template's bindings, and map each binding to a source field,
// constant, or image. Emits a serializable MappingConfig the PanelBinder runs.

import { useEffect, useMemo, useState, useRef } from "react";
import {
  createClient,
  describeTemplateBindings,
  type AirzClient,
  type BindingInfo,
  type FieldConfig,
  type FormatKind,
  type MappingConfig,
  type PanelConfig,
  type Rundown,
  type RundownItem,
} from "@airz/rundown-sdk";

/**
 * An app-defined panel the operator can pick from (instead of typing a generic
 * one). Carries the panel's identity + air policy + any preset field mapping, so
 * choosing "Presidential Ticker" or "City Results" only leaves a rundown item to
 * bind.
 */
export interface PanelCatalogEntry {
  panelId: string;
  label: string;
  air?: "cue" | "live";
  select?: string;
  liveFields?: string[];
  fields?: FieldConfig[];
  /** Source paths bindable for THIS panel (its own HTML/data properties). When
   * set, the field-mapping autocomplete is scoped to these instead of the global
   * `sourcePaths` — so a city panel won't offer candidate paths, etc. */
  sourcePaths?: string[];
}

export interface AirzConfiguratorProps {
  open: boolean;
  onClose: () => void;
  config: MappingConfig;
  onChange: (config: MappingConfig) => void;
  /** Known source field paths offered as autocomplete when mapping. */
  sourcePaths?: string[];
  /**
   * App catalog of available panels. When provided, "Add panel" offers these to
   * pick (prepopulated with id/label/air/fields) instead of creating a blank one.
   */
  panelCatalog?: PanelCatalogEntry[];
  /** Reuse an authenticated client; otherwise the overlay logs in itself. */
  client?: AirzClient | null;
  onClient?: (client: AirzClient) => void;
}

const FORMATS: FormatKind[] = ["none", "int", "dec1", "dec2", "trInt", "pct1", "pct2", "upper"];
const FORMAT_LABEL: Record<FormatKind, string> = {
  none: "none (as-is)",
  int: "int → 49",
  dec1: "dec1 → 49.5",
  dec2: "dec2 → 49.48",
  trInt: "trInt → 1.292.189",
  pct1: "pct1 → %49.5",
  pct2: "pct2 → %49.48",
  upper: "upper → ABC",
};

export function AirzConfigurator(props: AirzConfiguratorProps) {
  const { open, onClose, config, onChange } = props;
  const [client, setClient] = useState<AirzClient | null>(props.client ?? null);
  const [activePanel, setActivePanel] = useState<string | null>(
    config.panels[0]?.panelId ?? null,
  );

  const patch = (next: Partial<MappingConfig>) => onChange({ ...config, ...next });
  const patchPanel = (panelId: string, next: Partial<PanelConfig>) =>
    patch({
      panels: config.panels.map((p) =>
        p.panelId === panelId ? { ...p, ...next } : p,
      ),
    });

  const addPanel = () => {
    const n = config.panels.length + 1;
    const id = `panel-${n}`;
    patch({
      panels: [
        ...config.panels,
        { panelId: id, label: `Panel ${n}`, rundownId: 0, itemId: 0, fields: [] },
      ],
    });
    setActivePanel(id);
  };

  const catalog = props.panelCatalog ?? [];
  const availableCatalog = catalog.filter(
    (c) => !config.panels.some((p) => p.panelId === c.panelId),
  );
  // Re-key an existing panel slot to a different catalog panel, keeping the bound
  // rundown/item but adopting the new panel's label/air/fields.
  const pickPanelIdentity = (oldId: string, newId: string) => {
    if (oldId === newId) return;
    const entry = catalog.find((c) => c.panelId === newId);
    if (!entry) return;
    patch({
      panels: config.panels.map((p) =>
        p.panelId === oldId
          ? {
              panelId: entry.panelId,
              label: entry.label,
              rundownId: p.rundownId,
              itemId: p.itemId,
              ...(entry.air ? { air: entry.air } : {}),
              ...(entry.select ? { select: entry.select } : {}),
              ...(entry.liveFields ? { liveFields: entry.liveFields } : {}),
              fields: entry.fields ?? [],
            }
          : p,
      ),
    });
    setActivePanel(newId);
  };

  const addFromCatalog = (panelId: string) => {
    const entry = catalog.find((c) => c.panelId === panelId);
    if (!entry) return;
    patch({
      panels: [
        ...config.panels,
        {
          panelId: entry.panelId,
          label: entry.label,
          rundownId: 0,
          itemId: 0,
          ...(entry.air ? { air: entry.air } : {}),
          ...(entry.select ? { select: entry.select } : {}),
          ...(entry.liveFields ? { liveFields: entry.liveFields } : {}),
          fields: entry.fields ?? [],
        },
      ],
    });
    setActivePanel(entry.panelId);
  };
  const removePanel = (panelId: string) => {
    patch({ panels: config.panels.filter((p) => p.panelId !== panelId) });
    if (activePanel === panelId) setActivePanel(null);
  };

  if (!open) return null;
  const panel = config.panels.find((p) => p.panelId === activePanel) ?? null;

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.head}>
          <strong>airZ · Configuration</strong>
          <button style={S.x} onClick={onClose}>
            ✕
          </button>
        </div>

        <ServerBar
          config={config}
          client={client}
          onBaseUrl={(baseUrl) => patch({ server: { ...config.server, baseUrl } })}
          onClient={(c) => {
            setClient(c);
            props.onClient?.(c);
          }}
        />

        <div style={S.body}>
          <aside style={S.rail}>
            <div style={S.railHead}>Panels</div>
            {config.panels.map((p) => (
              <div
                key={p.panelId}
                style={{
                  ...S.railItem,
                  ...(p.panelId === activePanel ? S.railItemActive : null),
                }}
                onClick={() => setActivePanel(p.panelId)}
              >
                <span>{p.label ?? p.panelId}</span>
                <button
                  style={S.miniX}
                  onClick={(e) => {
                    e.stopPropagation();
                    removePanel(p.panelId);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {catalog.length > 0 ? (
              availableCatalog.length > 0 ? (
                <select
                  style={{ ...S.input, marginTop: 8 }}
                  value=""
                  onChange={(e) => e.target.value && addFromCatalog(e.target.value)}
                  title="Pick an available panel to bind to a rundown item"
                >
                  <option value="">+ Add panel…</option>
                  {availableCatalog.map((c) => (
                    <option key={c.panelId} value={c.panelId}>
                      {c.label}
                      {c.air === "live" ? "  · live" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ ...S.muted, marginTop: 8 }}>All panels added.</div>
              )
            ) : (
              <button style={S.addBtn} onClick={addPanel}>
                + Add panel
              </button>
            )}
          </aside>

          <main style={S.main}>
            {panel ? (
              <PanelEditor
                client={client}
                panel={panel}
                sourcePaths={
                  catalog.find((c) => c.panelId === panel.panelId)?.sourcePaths ??
                  props.sourcePaths ??
                  []
                }
                catalog={catalog}
                usedIds={config.panels.map((p) => p.panelId)}
                onPickPanel={(newId) => pickPanelIdentity(panel.panelId, newId)}
                onChange={(next) => patchPanel(panel.panelId, next)}
              />
            ) : (
              <div style={S.muted}>Select or add a panel to configure.</div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function ServerBar(props: {
  config: MappingConfig;
  client: AirzClient | null;
  onBaseUrl: (v: string) => void;
  onClient: (c: AirzClient) => void;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>(props.client ? "connected" : "");

  const connect = async () => {
    setBusy(true);
    setStatus("");
    try {
      const c = createClient({ baseUrl: props.config.server.baseUrl });
      const s = await c.auth.login(username, password);
      props.onClient(c);
      setStatus(`connected · ${s.user.username} (${s.user.role})`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={S.server}>
      <label style={S.lbl}>Controller URL</label>
      <input
        style={{ ...S.input, flex: 2 }}
        value={props.config.server.baseUrl}
        placeholder="http://192.168.1.50:3467"
        onChange={(e) => props.onBaseUrl(e.target.value)}
      />
      <input
        style={{ ...S.input, flex: 1 }}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="user"
      />
      <input
        style={{ ...S.input, flex: 1 }}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password"
      />
      <button style={S.btn} disabled={busy} onClick={connect}>
        {busy ? "…" : "Connect"}
      </button>
      <span style={{ ...S.muted, flex: 2 }}>{status}</span>
    </div>
  );
}

function PanelEditor(props: {
  client: AirzClient | null;
  panel: PanelConfig;
  sourcePaths: string[];
  onChange: (next: Partial<PanelConfig>) => void;
  /** App catalog of available panels + ids already used, so Panel id is a
   * dropdown that re-keys this slot to another catalog panel (keeping its item). */
  catalog?: PanelCatalogEntry[];
  usedIds?: string[];
  onPickPanel?: (newId: string) => void;
}) {
  const { client, panel } = props;
  const catalog = props.catalog ?? [];
  const usedIds = new Set(props.usedIds ?? []);
  // Options: this panel's own id + any catalog panel not already added elsewhere.
  const panelOptions = catalog.filter((c) => c.panelId === panel.panelId || !usedIds.has(c.panelId));
  const [rundowns, setRundowns] = useState<Rundown[]>([]);
  const [items, setItems] = useState<RundownItem[]>([]);
  const [templatesById, setTemplatesById] = useState<Map<number, string>>(new Map());
  const [bindings, setBindings] = useState<BindingInfo[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    client.rundowns.list().then(setRundowns).catch((e) => setErr(String(e)));
    // Template names, so an item with no title reads as its graphic name, not an id.
    client.templates
      .list()
      .then((tpls) => setTemplatesById(new Map(tpls.map((t) => [t.id, t.name]))))
      .catch(() => {});
  }, [client]);

  useEffect(() => {
    if (!client || !panel.rundownId) return;
    client.items.list(panel.rundownId).then(setItems).catch((e) => setErr(String(e)));
  }, [client, panel.rundownId]);

  // A human label for an item: its title, else its Rive template name, else id.
  const itemLabel = (i: RundownItem) => {
    const tname = i.templateId ? templatesById.get(i.templateId) : undefined;
    return (i.title ?? "").trim() || tname || `Item ${i.id}`;
  };

  const selectedItem = items.find((i) => i.id === panel.itemId);
  useEffect(() => {
    if (!client || !selectedItem?.templateId) {
      setBindings([]);
      return;
    }
    describeTemplateBindings(client, selectedItem.templateId)
      .then(setBindings)
      .catch((e) => setErr(String(e)));
  }, [client, selectedItem?.templateId]);

  const fieldByKey = useMemo(() => {
    const m = new Map<string, FieldConfig>();
    for (const f of panel.fields) m.set(f.to, f);
    return m;
  }, [panel.fields]);

  const setField = (key: string, next: Partial<FieldConfig> | null) => {
    const others = panel.fields.filter((f) => f.to !== key);
    if (next === null) {
      props.onChange({ fields: others });
      return;
    }
    const current = fieldByKey.get(key) ?? { to: key };
    props.onChange({ fields: [...others, { ...current, ...next, to: key }] });
  };

  const liveSet = useMemo(() => new Set(panel.liveFields ?? []), [panel.liveFields]);
  const toggleLive = (key: string, on: boolean) => {
    const next = new Set(liveSet);
    if (on) next.add(key);
    else next.delete(key);
    props.onChange({ liveFields: [...next] });
  };

  return (
    <div>
      <div style={S.row}>
        <div style={{ flex: 1 }}>
          <label style={S.lbl}>Panel id</label>
          {catalog.length > 0 && props.onPickPanel ? (
            <select
              style={S.input}
              value={panel.panelId}
              onChange={(e) => props.onPickPanel?.(e.target.value)}
              title="Which app panel this slot is — switching re-applies its fields, keeping the bound item"
            >
              {panelOptions.map((c) => (
                <option key={c.panelId} value={c.panelId}>
                  {c.label} ({c.panelId})
                </option>
              ))}
            </select>
          ) : (
            <input style={S.input} value={panel.panelId} readOnly />
          )}
        </div>
        <div style={{ flex: 2 }}>
          <label style={S.lbl}>Label</label>
          <input
            style={S.input}
            value={panel.label ?? ""}
            onChange={(e) => props.onChange({ label: e.target.value })}
          />
        </div>
      </div>

      <div style={S.row}>
        <div style={{ flex: 1 }}>
          <label style={S.lbl}>Rundown</label>
          <select
            style={S.input}
            value={panel.rundownId || ""}
            disabled={!client}
            onChange={(e) =>
              props.onChange({ rundownId: Number(e.target.value) || 0, itemId: 0 })
            }
          >
            <option value="">— select —</option>
            {rundowns.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.lbl}>Item (template)</label>
          <select
            style={S.input}
            value={panel.itemId || ""}
            disabled={!panel.rundownId}
            onChange={(e) => props.onChange({ itemId: Number(e.target.value) || 0 })}
          >
            <option value="">— select —</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {itemLabel(i)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ ...S.row, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={S.lbl}>Air policy</label>
          <select
            style={S.input}
            value={panel.air ?? "cue"}
            onChange={(e) => props.onChange({ air: e.target.value as "cue" | "live" })}
            title="Cue: prepare on selection, commit on take (VER/ALL). Live: stream to program once taken on air (e.g. a ticker)."
          >
            <option value="cue">Cue — prepare on selection, take with VER/ALL</option>
            <option value="live">Live — stream to program once on air (ticker)</option>
          </select>
        </div>
      </div>

      <div style={{ ...S.lbl, marginTop: 16 }}>
        Bindings → source ({bindings.length})
        {(panel.air ?? "cue") === "cue" && (
          <span style={S.muted}> · ⚡ = stream this field live even while cued</span>
        )}
      </div>
      {err && <div style={S.error}>{err}</div>}
      {!selectedItem && <div style={S.muted}>Pick an item to load its bindings.</div>}
      {selectedItem && bindings.length === 0 && (
        <div style={S.muted}>
          No template bindings found for this item (or template not downloaded).
        </div>
      )}

      <div style={{ maxHeight: 320, overflowY: "auto", marginTop: 6 }}>
        {bindings.map((b) => {
          const f = fieldByKey.get(b.key);
          const isImage = f?.image ?? b.type === "image";
          const dir = f?.direction ?? "out";
          return (
            <div key={b.key} style={S.bindRow}>
              <div style={{ flex: 1.4 }}>
                <div style={S.bindKey}>{b.key}</div>
                <span style={S.typeBadge}>{b.type}</span>
              </div>
              <select
                style={{ ...S.input, flex: 0.7 }}
                value={dir}
                onChange={(e) =>
                  setField(b.key, { direction: e.target.value as "in" | "out" })
                }
                title="out = data (html→controller) · in = control the app watches"
              >
                <option value="out">out</option>
                <option value="in">in</option>
              </select>
              {dir === "in" ? (
                <input
                  style={{ ...S.input, flex: 2 }}
                  placeholder="selector name e.g. activeCity"
                  value={f?.as ?? ""}
                  onChange={(e) => setField(b.key, { direction: "in", as: e.target.value })}
                />
              ) : (
                <>
                  <Combobox
                    style={{ flex: 2 }}
                    options={props.sourcePaths}
                    placeholder="source path e.g. candidates.0.name"
                    value={f?.from ?? ""}
                    onChange={(v) =>
                      setField(b.key, v ? { from: v } : { from: undefined })
                    }
                  />
                  <select
                    style={{ ...S.input, flex: 0.8 }}
                    value={f?.format ?? "none"}
                    onChange={(e) => setField(b.key, { format: e.target.value as FormatKind })}
                  >
                    {FORMATS.map((fmt) => (
                      <option key={fmt} value={fmt}>
                        {FORMAT_LABEL[fmt]}
                      </option>
                    ))}
                  </select>
                  <label style={S.imgToggle}>
                    <input
                      type="checkbox"
                      checked={isImage}
                      onChange={(e) => setField(b.key, { image: e.target.checked })}
                    />
                    img
                  </label>
                  {(panel.air ?? "cue") === "cue" && b.type !== "trigger" && (
                    <label
                      style={S.imgToggle}
                      title="Stream this field live to program even while the panel is cued (e.g. a ticking turnout%)."
                    >
                      <input
                        type="checkbox"
                        checked={liveSet.has(b.key)}
                        onChange={(e) => toggleLive(b.key, e.target.checked)}
                      />
                      ⚡
                    </label>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Combobox(props: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [localValue, setLocalValue] = useState(props.value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(props.value);
  }, [props.value]);

  const filtered = props.options.filter((o) =>
    o.toLowerCase().includes(localValue.toLowerCase())
  );

  return (
    <div style={{ position: "relative", ...props.style }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <input
          ref={inputRef}
          style={{ ...S.input, width: "100%", paddingRight: 24 }}
          value={localValue}
          placeholder={props.placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onChange={(e) => {
            setLocalValue(e.target.value);
            props.onChange(e.target.value);
            setOpen(true);
          }}
        />
        {localValue && (
          <button
            style={{
              position: "absolute",
              right: 6,
              background: "transparent",
              border: "none",
              color: "#9aa3ad",
              cursor: "pointer",
              padding: 2,
            }}
            onClick={() => {
              setLocalValue("");
              props.onChange("");
              inputRef.current?.focus();
            }}
          >
            ✕
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#16181d",
            border: "1px solid #2c2f36",
            borderRadius: 6,
            maxHeight: 200,
            overflowY: "auto",
            zIndex: 10,
            marginTop: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          }}
        >
          {filtered.map((o) => (
            <div
              key={o}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 12,
                borderBottom: "1px solid #202329",
                color: "#e4e4e7",
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                setLocalValue(o);
                props.onChange(o);
                setOpen(false);
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#262b30")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Neutral dark styling; host app theme is unaffected (scoped inline).
const S: Record<string, React.CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 },
  modal: { width: "min(920px, 94vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#16181d", color: "#e4e4e7", border: "1px solid #2c2f36", borderRadius: 12, fontFamily: "Inter, Segoe UI, sans-serif", overflow: "hidden" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #2c2f36" },
  x: { background: "transparent", color: "#9aa3ad", border: "none", fontSize: 16, cursor: "pointer" },
  server: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "12px 16px", borderBottom: "1px solid #2c2f36" },
  body: { display: "flex", minHeight: 0, flex: 1 },
  rail: { width: 200, borderRight: "1px solid #2c2f36", padding: 10, overflowY: "auto" },
  railHead: { fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#9aa3ad", margin: "4px 6px 8px" },
  railItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13 },
  railItemActive: { background: "#262b30" },
  miniX: { background: "transparent", color: "#71767d", border: "none", cursor: "pointer" },
  addBtn: { marginTop: 8, width: "100%", background: "#262b30", color: "#e4e4e7", border: "1px dashed #40474f", borderRadius: 6, padding: "8px", cursor: "pointer", fontSize: 12 },
  main: { flex: 1, padding: 16, overflowY: "auto" },
  row: { display: "flex", gap: 10, marginBottom: 8 },
  lbl: { display: "block", fontSize: 11, color: "#9aa3ad", textTransform: "uppercase", letterSpacing: 0.5, margin: "8px 0 4px" },
  input: { width: "100%", background: "#0f1114", border: "1px solid #2c2f36", color: "#e4e4e7", borderRadius: 6, padding: "7px 9px", fontSize: 13, boxSizing: "border-box" },
  btn: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  muted: { color: "#71767d", fontSize: 12, padding: "8px 0" },
  error: { color: "#ff6b6b", fontSize: 12, padding: "6px 0" },
  bindRow: { display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #202329" },
  bindKey: { fontSize: 13, fontWeight: 600 },
  typeBadge: { fontSize: 10, color: "#9aa3ad", background: "#262b30", padding: "1px 6px", borderRadius: 10 },
  imgToggle: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#9aa3ad" },
};
