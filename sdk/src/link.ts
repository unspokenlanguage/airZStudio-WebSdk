// LinkedItem — the synchronous control/data workflow for one playlist item.
//
// A control app has two kinds of bindings on an item:
//   • CONTROL (input)  — e.g. "City Code". May be changed by the operator here
//     OR on the controller's playlist item. The app WATCHES it: when it changes,
//     the app pulls fresh data for that selection and pushes results.
//   • DATA (output)    — e.g. vote counts, party names, images. STRICTLY one-way,
//     html → controller. The app owns them and never reads them back.
//
// LinkedItem watches the control keys over SSE (re-fetching to read values),
// fires `onControlChange` for both local sets and remote edits, and exposes a
// one-way, diffed `push` for the data side. It is loop-safe: pushing results
// never re-triggers control handling, and a control write updates the baseline
// before its own SSE echo returns.

import type { AirzClient } from "./client.js";
import type { RundownStream } from "./stream.js";
import type { BindingData } from "./types.js";

/** Origin of a control change delivered to `onControlChange`. */
export type ControlOrigin = "init" | "local" | "remote";

export interface LinkContext {
  origin: ControlOrigin;
  /** Push data (result) bindings one-way to the controller, diffed. */
  push: (results: BindingData) => void;
}

export interface LinkedItemOptions {
  rundownId: number;
  itemId: number;
  /** A live SSE stream (create with `client.stream(...)`). */
  stream: RundownStream;
  /** Binding keys treated as control inputs (watched two-way). */
  controls: string[];
  /** Fires when any control value changes (init / local set / remote edit). */
  onControlChange: (controls: BindingData, ctx: LinkContext) => void | Promise<void>;
  /** Debounce for reacting to controller-side updates (ms). Default 200. */
  reactMs?: number;
  /** Fetch current controls once at start and fire with origin "init". Default true. */
  primeOnStart?: boolean;
  /** Result-push debounce (ms) for the one-way data side. Default 120. */
  debounceMs?: number;
}

/** Normalize a stored binding value (bare, or `{type,value}`) to its scalar. */
function valueOf(v: unknown): unknown {
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return (v as { value: unknown }).value;
  }
  return v;
}

export class LinkedItem {
  private readonly resultSync;
  private lastControls: BindingData = {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly offs: Array<() => void> = [];
  private readonly ctx: LinkContext;

  constructor(
    private readonly client: AirzClient,
    private readonly opts: LinkedItemOptions,
  ) {
    this.resultSync = client.items.bindingSync({
      rundownId: opts.rundownId,
      itemId: opts.itemId,
      ...(opts.debounceMs !== undefined ? { debounceMs: opts.debounceMs } : {}),
    });
    this.ctx = { origin: "remote", push: (r) => this.push(r) };

    const onEvt = (ev: { data: { itemId?: number | null } }) => {
      // rundown.changed carries no itemId (desktop bridge) → always re-check.
      if (ev.data.itemId == null || ev.data.itemId === opts.itemId) {
        this.scheduleRefetch();
      }
    };
    this.offs.push(opts.stream.on("item.updated", onEvt as any));
    this.offs.push(opts.stream.on("rundown.changed", onEvt as any));

    if (opts.primeOnStart !== false) void this.refetch("init");
  }

  /** Current known control values. */
  controls(): BindingData {
    return { ...this.lastControls };
  }

  /** One-way push of data (result) bindings. */
  push(results: BindingData): void {
    this.resultSync.set(results);
  }

  /**
   * Set control values here (operator picked in the HTML). Writes them to the
   * item (html → controller), updates the baseline, then fires onControlChange
   * with origin "local" so the app pulls + pushes fresh data.
   */
  async setControl(values: BindingData): Promise<void> {
    await this.client.items.setData(this.opts.rundownId, this.opts.itemId, values);
    for (const [k, v] of Object.entries(values)) this.lastControls[k] = valueOf(v);
    await this.opts.onControlChange({ ...this.lastControls }, { ...this.ctx, origin: "local" });
  }

  private scheduleRefetch(): void {
    if (this.disposed || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refetch("remote");
    }, this.opts.reactMs ?? 200);
  }

  private async refetch(origin: ControlOrigin): Promise<void> {
    if (this.disposed) return;
    let item;
    try {
      item = await this.client.items.get(this.opts.rundownId, this.opts.itemId);
    } catch {
      return;
    }
    if (!item || this.disposed) return;

    const next: BindingData = {};
    let changed = false;
    for (const key of this.opts.controls) {
      const v = valueOf(item.data[key]);
      next[key] = v;
      if (JSON.stringify(v) !== JSON.stringify(this.lastControls[key])) changed = true;
    }
    // On init, always deliver the current selection even if "unchanged".
    if (!changed && origin !== "init") return;
    this.lastControls = next;
    await this.opts.onControlChange({ ...next }, { ...this.ctx, origin });
  }

  close(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const off of this.offs) off();
    this.offs.length = 0;
  }
}
