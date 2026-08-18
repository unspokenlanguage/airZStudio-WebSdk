// Mapping layer: connect slices of an arbitrary source document to the data
// bindings of one or more playlist items ("panels"). This is how a single feed
// (e.g. 2023 election results) drives several graphics at once — a general
// ticker, a per-city panel — each pulling the slice it needs, including images.
//
//   source doc ──select──▶ slice ──fields/repeat──▶ BindingData ──▶ item bindings
//
// A PanelBinder owns one diffing BindingSync per panel, resolves image bindings
// (pass-through URL or upload-and-cache), and pushes only what changed.

import type { AirzClient } from "./client.js";
import type { BindingData, BindingType } from "./types.js";
import type { BindingSync } from "./sync.js";

// ── Image bindings ──────────────────────────────────────────────────────────

/** A marker wrapping an image source that must be resolved before pushing. */
export interface ImageRef {
  readonly __airzImage: true;
  readonly src: string;
  readonly name?: string;
}

/** Mark a value as an image binding. Returns undefined for empty sources so the
 * key is skipped rather than clearing the binding. */
export function image(src: string | null | undefined, name?: string): ImageRef | undefined {
  if (!src) return undefined;
  return { __airzImage: true, src, ...(name ? { name } : {}) };
}

function isImageRef(v: unknown): v is ImageRef {
  return !!v && typeof v === "object" && (v as ImageRef).__airzImage === true;
}

/** Strategy for turning an ImageRef into a controller-resolvable value. */
export interface ImageResolver {
  resolve(ref: ImageRef): Promise<string>;
}

/** Default: use the image URL/path as-is (the renderer fetches it directly). */
export const passthroughImages: ImageResolver = {
  resolve: async (ref) => ref.src,
};

/**
 * Upload each distinct image to the controller's asset store once and reuse the
 * returned local path. Ideal for stable assets like candidate headshots and
 * party logos — they upload on first sight, then every push is a cheap path.
 */
export function uploadingImages(
  client: AirzClient,
  opts: { folder?: string } = {},
): ImageResolver {
  const cache = new Map<string, Promise<string>>();
  const folder = opts.folder ?? "/uploads";
  return {
    resolve(ref: ImageRef): Promise<string> {
      let p = cache.get(ref.src);
      if (!p) {
        p = (async () => {
          const res = await fetch(ref.src);
          if (!res.ok) throw new Error(`image fetch failed: ${ref.src}`);
          const blob = await res.blob();
          const name = ref.name ?? fileNameFromUrl(ref.src);
          const asset = await client.assets.upload(name, blob, folder);
          return asset.localPath;
        })();
        cache.set(ref.src, p);
      }
      return p;
    },
  };
}

function fileNameFromUrl(url: string): string {
  try {
    const p = new URL(url, "http://x").pathname;
    const base = p.split("/").pop() || "image";
    return decodeURIComponent(base) || "image";
  } catch {
    return "image";
  }
}

// ── Field & repeat rules ────────────────────────────────────────────────────

export type From<S> = string | ((slice: S) => unknown);

/** One binding rule: derive `to` from the panel's source slice. */
export interface Field<S = unknown> {
  to: string;
  from: From<S>;
  type?: BindingType;
  transform?: (value: unknown, slice: S) => unknown;
}

/** Expand an array in the slice into a flat, indexed BindingData map. */
export interface Repeat<S = unknown> {
  /** Where the array lives in the slice. */
  from: string | ((slice: S) => unknown[]);
  /** Cap the number of rows emitted (e.g. top 4 candidates). */
  limit?: number;
  /** Produce bindings for one row; index is 0-based. May include ImageRefs. */
  as: (row: any, index: number) => BindingData;
}

/** Read a dotted path (`a.b.0.c`) from an object; numeric segments index arrays. */
export function pick(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, key) => {
    if (o == null) return undefined;
    return (o as Record<string, unknown>)[key];
  }, obj);
}

function resolveFrom<S>(slice: S, from: From<S>): unknown {
  return typeof from === "function" ? from(slice) : pick(slice, from);
}

// ── Panel specification ─────────────────────────────────────────────────────

export interface PanelTarget {
  rundownId: number;
  itemId: number;
}

export interface PanelSpec<Source = any, Slice = any> {
  /** Stable id for this panel (also the connection key). */
  name: string;
  target: PanelTarget;
  /** Pick the slice of the source this panel cares about. Defaults to identity. */
  select?: (source: Source) => Slice;
  fields?: Field<Slice>[];
  repeats?: Repeat<Slice>[];
  /** Debounce for this panel's writes (ms). */
  debounceMs?: number;
}

interface Panel {
  spec: PanelSpec;
  sync: BindingSync;
}

// ── Binder ──────────────────────────────────────────────────────────────────

export interface PanelBinderOptions {
  /** How image bindings are resolved. Defaults to pass-through URLs. */
  images?: ImageResolver;
}

/**
 * Drives many panels from one source document. Add panels, then call
 * `update(source)` each time fresh data arrives — the binder recomputes every
 * panel, resolves images, and diff-pushes only changed bindings per item.
 */
export class PanelBinder<Source = any> {
  private readonly panels = new Map<string, Panel>();
  private readonly images: ImageResolver;

  constructor(
    private readonly client: AirzClient,
    opts: PanelBinderOptions = {},
  ) {
    this.images = opts.images ?? passthroughImages;
  }

  /** Register (or replace) a panel and its target item. */
  add<Slice>(spec: PanelSpec<Source, Slice>): this {
    this.panels.get(spec.name)?.sync.flush().catch(() => {});
    const sync = this.client.items.bindingSync({
      rundownId: spec.target.rundownId,
      itemId: spec.target.itemId,
      ...(spec.debounceMs !== undefined ? { debounceMs: spec.debounceMs } : {}),
    });
    this.panels.set(spec.name, { spec, sync });
    return this;
  }

  /** Seed a panel's diff baseline from the item's current on-air values. */
  prime(name: string, current: BindingData): this {
    this.panels.get(name)?.sync.prime(current);
    return this;
  }

  has(name: string): boolean {
    return this.panels.has(name);
  }

  /** Recompute + push all panels from a fresh source document. */
  async update(source: Source): Promise<void> {
    await Promise.all(
      [...this.panels.values()].map((p) => this.updatePanel(p, source)),
    );
  }

  /** Recompute + push a single named panel. */
  async updateOne(name: string, source: Source): Promise<void> {
    const p = this.panels.get(name);
    if (p) await this.updatePanel(p, source);
  }

  private async updatePanel(panel: Panel, source: Source): Promise<void> {
    const spec = panel.spec;
    const slice = spec.select ? spec.select(source) : source;

    const raw: BindingData = {};
    for (const f of spec.fields ?? []) {
      let v = resolveFrom(slice, f.from);
      if (f.transform) v = f.transform(v, slice);
      if (v === undefined) continue;
      raw[f.to] = f.type ? { type: f.type, value: v } : v;
    }
    for (const rep of spec.repeats ?? []) {
      const arr = (typeof rep.from === "function"
        ? rep.from(slice as any)
        : (pick(slice, rep.from) as unknown[])) ?? [];
      const rows = rep.limit != null ? arr.slice(0, rep.limit) : arr;
      rows.forEach((row, i) => Object.assign(raw, rep.as(row, i)));
    }

    const resolved = await this.resolveImages(raw);
    panel.sync.set(resolved);
  }

  /** Replace ImageRefs with resolved paths; drop undefined image values. */
  private async resolveImages(data: BindingData): Promise<BindingData> {
    const out: BindingData = {};
    const jobs: Promise<void>[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (isImageRef(v)) {
        jobs.push(
          this.images.resolve(v).then((resolved) => {
            out[k] = resolved;
          }),
        );
      } else if (v !== undefined) {
        out[k] = v;
      }
    }
    await Promise.all(jobs);
    return out;
  }

  /** Force all pending writes out immediately. */
  async flush(): Promise<void> {
    await Promise.all([...this.panels.values()].map((p) => p.sync.flush()));
  }
}
