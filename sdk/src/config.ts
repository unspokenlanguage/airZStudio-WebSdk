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
      if (fc.image) return image(formatted == null ? undefined : String(formatted));
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
