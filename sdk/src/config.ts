// Serializable mapping config — the artifact a visual configurator produces and
// the PanelBinder consumes. It captures everything needed to reconstruct panels
// at runtime without code: the controller URL, and per panel, the target item
// plus a flat list of binding→source mappings.
//
// Because a template exposes each repeated slot as its own binding key
// (`Candidate 1 Name`, `Candidate 2 Name`, …), a flat field list is enough — the
// visual tool maps concrete keys to concrete source paths; no repeat DSL needed.

import { image, pick, type Field, type PanelSpec } from "./mapping.js";
import type { AirzClient } from "./client.js";
import type { RundownStream } from "./stream.js";
import type { BindingType } from "./types.js";

/** How to format a mapped value before pushing. */
export type FormatKind =
  | "none"
  | "int"      // Number(v)
  | "trInt"    // Number(v).toLocaleString("tr-TR")  → 1.292.189
  | "pct1"     // "%" + v.toFixed(1)
  | "pct2"     // "%" + v.toFixed(2)
  | "upper";

/** One binding mapping: bind `to` from a source path, a constant, or an image. */
export interface FieldConfig {
  to: string;              // exact template binding key
  from?: string;           // dotted source path, e.g. "candidates.0.name"
  const?: string;          // literal value (used when `from` is absent)
  image?: boolean;         // resolve as an image binding
  format?: FormatKind;
  /**
   * "out" (default): a DATA binding pushed html → controller.
   * "in": a CONTROL binding the app watches (may change on the controller). Its
   * value is not pushed from source; instead it drives `as` (an app selector).
   */
  direction?: "in" | "out";
  /** For `direction:"in"` — the app-level selector this control feeds (e.g. "activeCity"). */
  as?: string;
}

/**
 * One step of a declarative slice. Generic — no assumptions about names:
 * "from the current node, take `path` (if given); if it's an array, pick the
 * element whose `matchField` equals the runtime value of selector `selector`."
 * Chain steps to drill down (e.g. list → item → sublist → item).
 */
export interface SelectStep {
  path?: string;
  matchField?: string;
  selector?: string;
}

/** One panel: a target item + its field mappings. */
export interface PanelConfig {
  panelId: string;
  label?: string;
  rundownId: number;
  itemId: number;
  /** Static source path to slice before mapping. */
  select?: string;
  /** Declarative, selector-driven slice (resolved at runtime from `selectors`). */
  selectBy?: SelectStep[];
  fields: FieldConfig[];
  debounceMs?: number;
}

/** Build a slice resolver from selectBy steps + the current selector values. */
function buildSelectBy(
  steps: SelectStep[],
  selectors: Record<string, unknown>,
): (source: unknown) => unknown {
  return (source: unknown) => {
    let cur: unknown = source;
    for (const step of steps) {
      const base = step.path ? pick(cur, step.path) : cur;
      if (Array.isArray(base) && step.matchField && step.selector != null) {
        const want = selectors[step.selector];
        cur = base.find(
          (x) => String(pick(x, step.matchField!)) === String(want),
        );
      } else {
        cur = base;
      }
      if (cur == null) return undefined;
    }
    return cur;
  };
}

export interface MappingConfig {
  version: 1;
  server: { baseUrl: string };
  panels: PanelConfig[];
  lastModified?: number;
}

export function emptyConfig(baseUrl = ""): MappingConfig {
  return { version: 1, server: { baseUrl }, panels: [] };
}

function formatValue(value: unknown, kind: FormatKind | undefined): unknown {
  if (value == null || kind == null || kind === "none") return value;
  const n = Number(value);
  switch (kind) {
    case "int":
      return Number.isFinite(n) ? Math.round(n) : value;
    case "trInt":
      return Number.isFinite(n) ? n.toLocaleString("tr-TR") : value;
    case "pct1":
      return Number.isFinite(n) ? `%${n.toFixed(1)}` : value;
    case "pct2":
      return Number.isFinite(n) ? `%${n.toFixed(2)}` : value;
    case "upper":
      return String(value).toUpperCase();
    default:
      return value;
  }
}

/**
 * Turn a PanelConfig into a runtime PanelSpec. Pass `select` to override the
 * slice resolver (e.g. the currently active city/county chosen in the UI).
 */
/** Control (input) keys of a panel, with the app selector each one feeds. */
export function panelControls(pc: PanelConfig): { key: string; as: string }[] {
  return pc.fields
    .filter((f) => f.direction === "in")
    .map((f) => ({ key: f.to, as: f.as ?? f.to }));
}

export function configToPanelSpec(
  pc: PanelConfig,
  opts: {
    /** Explicit slice resolver (overrides selectBy/select). */
    select?: (source: any) => any;
    /** Runtime selector values that drive `pc.selectBy`. */
    selectors?: Record<string, unknown>;
  } = {},
): PanelSpec {
  // Control (input) fields are watched, not pushed from source — exclude them.
  const outFields = pc.fields.filter((fc) => fc.direction !== "in");
  const fields: Field[] = outFields.map((fc) => ({
    to: fc.to,
    from: (slice: unknown): unknown => {
      const base =
        fc.const !== undefined ? fc.const : fc.from ? pick(slice, fc.from) : undefined;
      const formatted = formatValue(base, fc.format);
      
      // Auto-detect image paths if the user forgot to check the 'img' box
      const isImage = fc.image || (
        typeof formatted === 'string' && 
        /\.(png|jpg|jpeg|svg|webp|gif|bmp)(\?.*)?$/i.test(formatted)
      );
      
      if (isImage) return image(formatted == null ? undefined : String(formatted));
      return formatted;
    },
  }));

  const select =
    opts.select ??
    (pc.selectBy && pc.selectBy.length
      ? buildSelectBy(pc.selectBy, opts.selectors ?? {})
      : pc.select
        ? (s: unknown) => pick(s, pc.select!)
        : undefined);

  const spec: PanelSpec = {
    name: pc.panelId,
    target: { rundownId: pc.rundownId, itemId: pc.itemId },
    fields,
  };
  if (select) spec.select = select;
  if (pc.debounceMs !== undefined) spec.debounceMs = pc.debounceMs;
  return spec;
}

// ── Persistence ─────────────────────────────────────────────────────────────

export interface ConfigStore {
  load(): MappingConfig | undefined;
  save(config: MappingConfig): void;
  clear(): void;
}

export function localStorageConfig(key = "airz.mappingConfig"): ConfigStore {
  return {
    load: () => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as MappingConfig) : undefined;
      } catch {
        return undefined;
      }
    },
    save: (config) => localStorage.setItem(key, JSON.stringify(config)),
    clear: () => localStorage.removeItem(key),
  };
}

export function urlHashConfig(key = "airz.mappingConfig"): ConfigStore {
  const local = localStorageConfig(key);
  return {
    load: () => {
      try {
        const hash = window.location.hash.slice(1);
        if (hash) {
          const rawStr = decodeURIComponent(hash);
          // Only parse if it looks like JSON to avoid parsing random hashes
          if (rawStr.startsWith("{")) {
            const config = JSON.parse(rawStr) as MappingConfig;
            if (config && config.version) {
              local.save(config);
              return config;
            }
          }
        }
      } catch (e) {
        // ignore hash errors, fallback to local
      }
      return local.load();
    },
    save: (config) => {
      local.save(config);
      const str = encodeURIComponent(JSON.stringify(config));
      window.history.replaceState(null, "", "#" + str);
    },
    clear: () => {
      local.clear();
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    },
  };
}

// ── Cross-machine guardrails ────────────────────────────────────────────────
//
// Configs are stored ON the controller and target rundown/item by numeric ID —
// and those IDs are unique PER controller database. So a config only syncs when
// every client points at the SAME controller. `127.0.0.1` on a second machine
// points at THAT machine's (empty) controller — the classic footgun. These
// helpers make the failure visible instead of silently blanking the dropdowns.

/** True when a base URL points at this machine's loopback (localhost/127.0.0.1). */
export function isLoopbackUrl(url: string): boolean {
  try {
    const h = new URL(url.includes("://") ? url : `http://${url}`).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".localhost");
  } catch {
    return false;
  }
}

export interface PanelTargetStatus {
  panelId: string;
  label?: string;
  rundownId: number;
  itemId: number;
  ok: boolean;
  reason?: string;
}

/**
 * Check every panel's (rundownId, itemId) against the CONNECTED controller.
 * Use this after loading/discovering a config so the UI can explain *why* a
 * target is invalid ("belongs to a different controller") rather than resetting
 * the dropdown to "— select —" with no reason.
 */
export async function validateConfigTargets(
  client: AirzClient,
  config: MappingConfig,
): Promise<PanelTargetStatus[]> {
  const rundowns = await client.rundowns.list();
  const rundownIds = new Set(rundowns.map((r) => r.id));
  const itemCache = new Map<number, Set<number>>();
  const out: PanelTargetStatus[] = [];

  for (const p of config.panels) {
    const base = { panelId: p.panelId, label: p.label, rundownId: p.rundownId, itemId: p.itemId };
    if (!p.rundownId || !p.itemId) {
      out.push({ ...base, ok: false, reason: "not configured" });
      continue;
    }
    if (!rundownIds.has(p.rundownId)) {
      out.push({ ...base, ok: false, reason: `rundown ${p.rundownId} is not on this controller (different controller?)` });
      continue;
    }
    let items = itemCache.get(p.rundownId);
    if (!items) {
      items = new Set((await client.items.list(p.rundownId)).map((i) => i.id));
      itemCache.set(p.rundownId, items);
    }
    if (!items.has(p.itemId)) {
      out.push({ ...base, ok: false, reason: `item ${p.itemId} not found — likely authored on a different controller` });
      continue;
    }
    out.push({ ...base, ok: true });
  }
  return out;
}

// ── Template introspection (feeds the visual mapper) ────────────────────────

export interface BindingInfo {
  key: string;
  type: BindingType;
}

/** List a template's bindable keys + types, sorted, ready for a mapping UI. */
export async function describeTemplateBindings(
  client: AirzClient,
  templateId: number,
): Promise<BindingInfo[]> {
  const tpl = await client.templates.get(templateId);
  return Object.entries(tpl.dataBindings ?? {})
    .map(([key, schema]) => ({ key, type: (schema?.type ?? "string") as BindingType }))
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

// ── Remote configuration (stored ON the controller) ─────────────────────────
//
// The config is stashed under `_airzWebConfig_<appId>` in a chosen item's
// databindings, so every client on the SAME controller shares it. Two subtle
// controller behaviors must be handled or cross-machine sync silently fails:
//
//  1. `PATCH .../data` WRAPS each value as `{type, value}` before storing. So on
//     read, the config comes back wrapped — we must unwrap `.value`.
//  2. `PATCH .../data` REPLACES the item's whole override map with what we send.
//     So we must re-send the item's existing data alongside our config key, or
//     we would wipe the item's real bindings.
//
// We store the config as a JSON STRING (a clean scalar) but the reader also
// accepts a raw object, so configs written by older builds still load.

const CONFIG_PREFIX = "_airzWebConfig_";

/** Namespaced key used in the first-class `/web-configs` store. */
function mappingKey(appId: string): string {
  return `mapping:${appId}`;
}

/** Unwrap a stored databinding value (`{type,value}` → value; else as-is). */
function unwrapValue(v: unknown): unknown {
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return (v as { value: unknown }).value;
  }
  return v;
}

/** Parse a stored config value into a MappingConfig (handles string or object). */
function parseStoredConfig(v: unknown): MappingConfig | undefined {
  let raw = unwrapValue(v);
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (raw && typeof raw === "object" && (raw as MappingConfig).version) {
    return raw as MappingConfig;
  }
  return undefined;
}

export interface RemoteConfigLocation {
  config: MappingConfig;
  targetRundownId: number;
  targetItemId: number;
}

/**
 * Scan every rundown/item on the CONNECTED controller for the most recently
 * saved config under `_airzWebConfig_<appId>`. Returns the config plus the item
 * it lives in (so you can watch it for live updates). Undefined if none found —
 * which, on a second machine, usually means you're pointed at a DIFFERENT
 * controller (see `isLoopbackUrl` / the same-controller rule).
 */
export async function autoDiscoverRemoteConfig(
  client: AirzClient,
  appId: string,
): Promise<RemoteConfigLocation | undefined> {
  // Prefer the first-class store when the controller exposes it.
  if (await client.webConfigs.available()) {
    try {
      const entry = await client.webConfigs.get(mappingKey(appId));
      const config = entry ? parseStoredConfig(entry.value) : undefined;
      if (config) {
        // rundown/item are irrelevant in endpoint mode (0 sentinel).
        return { config, targetRundownId: 0, targetItemId: 0 };
      }
    } catch (e) {
      console.warn("webConfigs.get failed (CORS?), falling back to item search", e);
    }
  }

  const key = CONFIG_PREFIX + appId;
  const rundowns = await client.rundowns.list();
  let latest: RemoteConfigLocation | undefined;

  for (const rundown of rundowns) {
    const items = await client.items.list(rundown.id);
    for (const item of items) {
      if (!item.data || !(key in item.data)) continue;
      const config = parseStoredConfig(item.data[key]);
      if (!config) continue;
      if (!latest || (config.lastModified ?? 0) > (latest.config.lastModified ?? 0)) {
        latest = { config, targetItemId: item.id, targetRundownId: rundown.id };
      }
    }
  }
  return latest;
}

/**
 * A dedicated, reserved item that holds web configs and is NEVER a panel target.
 * This matters because `PATCH .../data` REPLACES an item's whole override map —
 * so storing config in a panel-target item gets it wiped by the next push. A
 * standalone disabled item is safe: nothing else writes to it.
 */
export const CONFIG_ITEM_TITLE = "__airz_webconfig__";

/** Locate the dedicated config item across all rundowns (by reserved title). */
async function findConfigItem(
  client: AirzClient,
): Promise<{ rundownId: number; itemId: number } | undefined> {
  const rundowns = await client.rundowns.list();
  for (const rundown of rundowns) {
    const items = await client.items.list(rundown.id);
    const found = items.find((i) => i.title === CONFIG_ITEM_TITLE);
    if (found) return { rundownId: rundown.id, itemId: found.id };
  }
  return undefined;
}

/** Find (or create) the reserved config item. Creates a disabled item so it
 * can never accidentally go on air, and no panel ever pushes to it. */
async function ensureConfigItem(
  client: AirzClient,
): Promise<{ rundownId: number; itemId: number } | undefined> {
  const existing = await findConfigItem(client);
  if (existing) return existing;
  const rundowns = await client.rundowns.list();
  if (rundowns.length === 0) return undefined;
  const rundownId = rundowns[0]!.id;
  const created = await client.items.create(rundownId, {
    title: CONFIG_ITEM_TITLE,
    type: "webUrl",
  });
  try {
    await client.items.update(rundownId, created.id, { enabled: false });
  } catch {
    /* non-fatal */
  }
  return { rundownId, itemId: created.id };
}

/**
 * Save a config to the controller in the reserved config item (created on first
 * use). Because that item is never a panel target, the config survives the
 * binder's frequent pushes. Returns where it was stored.
 */
export async function saveRemoteConfig(
  client: AirzClient,
  appId: string,
  config: MappingConfig,
): Promise<{ rundownId: number; itemId: number } | undefined> {
  const stamped: MappingConfig = { ...config, lastModified: Date.now() };

  // Prefer the clean endpoint: no item, no wrapping, no wipe.
  if (await client.webConfigs.available()) {
    try {
      await client.webConfigs.put(mappingKey(appId), stamped);
      return undefined;
    } catch (e) {
      console.warn("webConfigs.put failed (CORS?), falling back to item storage", e);
    }
  }

  const target = await ensureConfigItem(client);
  if (!target) return undefined;

  const item = await client.items.get(target.rundownId, target.itemId);
  const key = CONFIG_PREFIX + appId;
  // Preserve any OTHER app configs already on the item; replace ours.
  const merged: Record<string, unknown> = { ...(item?.data ?? {}) };
  merged[key] = JSON.stringify(stamped);
  await client.items.setData(target.rundownId, target.itemId, merged);
  return target;
}

/** Read this app's config directly from a known storage item. */
export async function loadRemoteConfig(
  client: AirzClient,
  appId: string,
  rundownId: number,
  itemId: number,
): Promise<MappingConfig | undefined> {
  if (await client.webConfigs.available()) {
    try {
      const entry = await client.webConfigs.get(mappingKey(appId));
      if (entry) return parseStoredConfig(entry.value);
    } catch (e) {
      console.warn("webConfigs.get failed (CORS?), falling back to item storage", e);
    }
  }
  const item = await client.items.get(rundownId, itemId);
  if (!item) return undefined;
  return parseStoredConfig(item.data[CONFIG_PREFIX + appId]);
}

/**
 * Live-sync a remote config: when the storage item changes on the controller
 * (edit from another machine), re-fetch and deliver the new config. Returns an
 * unsubscribe function. Requires a live stream (`client.stream(...)`).
 */
export function watchRemoteConfig(
  client: AirzClient,
  appId: string,
  opts: {
    rundownId: number;
    itemId: number;
    stream: RundownStream;
    onConfig: (config: MappingConfig) => void;
  },
): () => void {
  const key = CONFIG_PREFIX + appId;
  let lastStamp = 0;
  const handler = async (e: { data: { itemId?: number | null } }) => {
    if (e.data.itemId != null && e.data.itemId !== opts.itemId) return;
    const item = await client.items.get(opts.rundownId, opts.itemId).catch(() => undefined);
    if (!item || !(key in (item.data ?? {}))) return;
    const config = parseStoredConfig(item.data[key]);
    if (config && (config.lastModified ?? 0) > lastStamp) {
      lastStamp = config.lastModified ?? 0;
      opts.onConfig(config);
    }
  };
  const off1 = opts.stream.on("item.updated", handler as never);
  const off2 = opts.stream.on("rundown.changed", handler as never);
  return () => {
    off1();
    off2();
  };
}

/**
 * One-call cross-machine config sync: discover this app's config on the
 * controller now, deliver it, and keep delivering when it changes OR first
 * appears (handles the case where another machine saves it AFTER you connect).
 * Opens its own global stream. Returns an unsubscribe function.
 */
export function discoverAndWatchRemoteConfig(
  client: AirzClient,
  appId: string,
  opts: {
    onConfig: (config: MappingConfig, location: { rundownId: number; itemId: number }) => void;
  },
): () => void {
  let disposed = false;
  let delivered = false;
  let lastStamp = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stream = client.stream();

  const scan = async () => {
    if (disposed) return;
    const res = await autoDiscoverRemoteConfig(client, appId).catch(() => undefined);
    if (!res || disposed) return;
    const stamp = res.config.lastModified ?? 0;
    if (!delivered || stamp > lastStamp) {
      delivered = true;
      lastStamp = stamp;
      opts.onConfig(res.config, { rundownId: res.targetRundownId, itemId: res.targetItemId });
    }
  };
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void scan();
    }, 250);
  };
  const offs = [
    stream.on("item.updated", schedule),
    stream.on("item.created", schedule),
    stream.on("rundown.changed", schedule),
    stream.on("webconfig.updated", schedule), // endpoint-mode live-sync
  ];
  void scan();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    offs.forEach((o) => o());
    stream.close();
  };
}
