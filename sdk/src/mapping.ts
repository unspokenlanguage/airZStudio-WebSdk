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

/**
 * Smart resolver that attempts to find the image ALREADY uploaded on the controller
 * in a specific folder by matching the filename. If found, it links to its `localPath`
 * instantly without redundant network uploads. If not found, it gracefully falls back
 * to uploading it.
 */
export function linkingImages(
  client: AirzClient,
  opts: { folder: string }
): ImageResolver {
  const cache = new Map<string, Promise<string>>();
  
  // Cache of assets already on the controller in this folder
  let existingAssetsPromise: Promise<any[]> | null = null;
  
  return {
    resolve(ref: ImageRef): Promise<string> {
      let p = cache.get(ref.src);
      if (!p) {
        p = (async () => {
          const name = ref.name ?? fileNameFromUrl(ref.src);
          
          // 1. Fetch controller assets once
          if (!existingAssetsPromise) {
            existingAssetsPromise = client.assets.list({ folder: opts.folder, type: 'image' }).catch(() => []);
          }
          const existingAssets = await existingAssetsPromise;
          
          // 2. See if the asset already exists on the controller
          const match = existingAssets.find(a => a.name === name);
          if (match && match.localPath) {
            return match.localPath;
          }
          
          // 3. Fallback: Upload it if it's not there
          const res = await fetch(ref.src);
          if (!res.ok) throw new Error(`image fetch failed: ${ref.src}`);
          const blob = await res.blob();
          const asset = await client.assets.upload(name, blob, opts.folder);
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
  /**
   * Air policy for this panel:
   *  • "cue"  (default) — selection PREPARES data (preview only); the data reaches
   *    program only when you `take()` it (flush full data + fire the trigger).
   *    Use for full-screen graphics you cue then take.
   *  • "live" — once the panel has been taken on air, data STREAMS to program on
   *    every update (e.g. a results ticker whose numbers climb on air). Until its
   *    first trigger it stays in preview.
   * Combined with the binder's on-air state ([setOnAir]) to pick each write's
   * destination.
   */
  air?: "cue" | "live";
  /**
   * Explicit data mode override. When set, forces every write to live/staged and
   * bypasses the air×on-air derivation. Advanced/back-compat use.
   */
  mode?: "live" | "staged";
  /**
   * Binding keys that stream LIVE even inside a `cue` panel — e.g. a `turnout%`
   * that ticks on air while the rest of the panel waits for the take. Ignored on
   * a `live` panel (everything already streams).
   */
  liveFields?: string[];
}

interface Panel {
  spec: PanelSpec;
  sync: BindingSync;
  /** Second sync carrying only the `liveFields` subset (created lazily). */
  liveSync?: BindingSync;
  air: "cue" | "live";
  liveFields: Set<string>;
}

// ── Binder ──────────────────────────────────────────────────────────────────

export interface PanelBinderOptions {
  /** How image bindings are resolved. Defaults to pass-through URLs. */
  images?: ImageResolver;
  /** Global mode for all panels. Defaults to live. */
  mode?: "live" | "staged";
}

/**
 * Drives many panels from one source document. Add panels, then call
 * `update(source)` each time fresh data arrives — the binder recomputes every
 * panel, resolves images, and diff-pushes only changed bindings per item.
 */
export class PanelBinder<Source = any> {
  private readonly panels = new Map<string, Panel>();
  private readonly images: ImageResolver;
  private readonly mode?: "live" | "staged";
  /** Operator on-air state (the Rehearse ↔ On-Air toggle). While false, every
   * write and trigger stays on the preview. */
  private _onAir = false;

  constructor(
    private readonly client: AirzClient,
    opts: PanelBinderOptions = {},
  ) {
    this.images = opts.images ?? passthroughImages;
    this.mode = opts.mode;
  }

  /** Reflect the Rehearse ↔ On-Air toggle. Off = everything previews. */
  setOnAir(onAir: boolean): this {
    this._onAir = onAir;
    return this;
  }

  get onAir(): boolean {
    return this._onAir;
  }

  /** Register (or replace) a panel and its target item. */
  add<Slice>(spec: PanelSpec<Source, Slice>): this {
    const prev = this.panels.get(spec.name);
    prev?.sync.flush().catch(() => {});
    prev?.liveSync?.flush().catch(() => {});
    const mk = () =>
      this.client.items.bindingSync({
        rundownId: spec.target.rundownId,
        itemId: spec.target.itemId,
        ...(spec.debounceMs !== undefined ? { debounceMs: spec.debounceMs } : {}),
      });
    const liveFields = new Set(spec.liveFields ?? []);
    const sync = mk();
    // A cue panel with live-flagged fields needs a second sync so those keys can
    // stream (mode live) while the rest stay cued (mode staged) — one sync can't
    // carry two modes at once.
    const liveSync = liveFields.size > 0 ? mk() : undefined;
    this.panels.set(spec.name, {
      spec,
      sync,
      liveSync,
      air: spec.air ?? "cue",
      liveFields,
    });
    return this;
  }

  /** The data destination for a panel right now: explicit override wins, else a
   * live panel that's on air streams to program, everything else prepares
   * (preview / staged). */
  private modeFor(panel: Panel): "live" | "staged" {
    if (panel.spec.mode) return panel.spec.mode;
    return this._onAir && panel.air === "live" ? "live" : "staged";
  }

  /** Seed a panel's diff baseline from the item's current on-air values. */
  prime(name: string, current: BindingData): this {
    const panel = this.panels.get(name);
    panel?.sync.prime(current);
    panel?.liveSync?.prime(current);
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

    // A cue panel with live-flagged fields: split the write — flagged keys stream
    // (live once on air / preview while rehearsing), the rest follow the panel
    // policy. A live panel (or no live fields) pushes everything through `sync`.
    if (panel.liveSync && panel.liveFields.size > 0 && panel.air !== "live") {
      const liveData: BindingData = {};
      const cuedData: BindingData = {};
      for (const [k, v] of Object.entries(resolved)) {
        if (panel.liveFields.has(k)) liveData[k] = v;
        else cuedData[k] = v;
      }
      panel.sync.setMode(this.modeFor(panel));
      panel.liveSync.setMode(this._onAir ? "live" : "staged");
      panel.sync.set(cuedData);
      panel.liveSync.set(liveData);
    } else {
      panel.sync.setMode(this.modeFor(panel));
      panel.sync.set(resolved);
    }
  }

  /**
   * Take a CUE panel to air: flush its full prepared data and fire [triggerName]
   * so the graphic animates in carrying the latest values. While rehearsing
   * (not on air) this fires on the preview only. For a `live` panel — whose data
   * already streams — this just fires the trigger.
   */
  async take(name: string, triggerName: string): Promise<void> {
    const panel = this.panels.get(name);
    if (!panel) return;
    // Make sure the prepared data is on the server before the flush/trigger reads it.
    await panel.sync.flush();
    await panel.liveSync?.flush();
    const { rundownId, itemId } = panel.spec.target;
    if (!this._onAir) {
      await this.client.items.trigger(rundownId, itemId, triggerName, { mode: "staged" });
    } else if (panel.air === "cue") {
      await this.client.items.trigger(rundownId, itemId, triggerName, { flushStaged: true });
    } else {
      await this.client.items.trigger(rundownId, itemId, triggerName);
    }
  }

  /**
   * Fire a trigger without flushing — for live panels (e.g. a ticker advancing
   * its loop) or any generic trigger. On air it fires on program; while
   * rehearsing it fires on the preview.
   */
  async fire(name: string, triggerName: string): Promise<void> {
    const panel = this.panels.get(name);
    if (!panel) return;
    const { rundownId, itemId } = panel.spec.target;
    await this.client.items.trigger(
      rundownId,
      itemId,
      triggerName,
      this._onAir ? {} : { mode: "staged" },
    );
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
