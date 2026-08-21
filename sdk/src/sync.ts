// Binding sync: the write half of a control app.
//
// A control app repeatedly computes a full set of binding values from its own
// data source, then wants the on-air item to reflect them. Sending the whole
// map on every tick would hammer the engine with redundant hot-applies. This
// helper diffs against the last-pushed values and PATCHes only what changed,
// with optional debouncing to coalesce bursts.

import type { BindingData } from "./types.js";

export interface BindingSyncOptions {
  rundownId: number;
  itemId: number;
  /**
   * Coalesce rapid `.set()` calls: wait this many ms of quiet before flushing.
   * 0 (default) flushes on the next microtask.
   */
  debounceMs?: number;
  /** Called after a successful PATCH with the keys that were sent. */
  onFlush?: (changed: BindingData) => void;
  onError?: (err: unknown) => void;
  mode?: "live" | "staged";
}

/** Value equality good enough for binding scalars and small JSON values. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

type Patcher = (
  rundownId: number,
  itemId: number,
  data: BindingData,
  options?: { mode?: "live" | "staged" },
) => Promise<unknown>;

/**
 * Diffing writer for one item's bindings. Construct via
 * `client.items.bindingSync(...)`. Call `.set(partial)` as data arrives.
 */
export class BindingSync {
  private lastSent: BindingData = {};
  private pending: BindingData = {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly patch: Patcher,
    private readonly opts: BindingSyncOptions,
  ) {}

  /** Seed the baseline (e.g. from the item's current `data`) so the first
   * diff is computed against reality, not an empty map. Does not send. */
  prime(current: BindingData): this {
    this.lastSent = { ...current };
    return this;
  }

  /** Merge a partial set of desired values; schedules a diffed flush. */
  set(partial: BindingData): this {
    Object.assign(this.pending, partial);
    this.schedule();
    return this;
  }

  private schedule(): void {
    if (this.timer) return;
    const ms = this.opts.debounceMs ?? 0;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  /** Force an immediate diffed flush; resolves when the network write settles. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Serialize writes so out-of-order PATCHes can't resurrect stale values.
    if (this.inFlight) await this.inFlight.catch(() => {});

    const changed: BindingData = {};
    for (const [k, v] of Object.entries(this.pending)) {
      if (!sameValue(v, this.lastSent[k])) changed[k] = v;
    }
    this.pending = {};
    if (Object.keys(changed).length === 0) return;

    this.inFlight = (async () => {
      try {
        await this.patch(this.opts.rundownId, this.opts.itemId, changed, { mode: this.opts.mode });
        Object.assign(this.lastSent, changed);
        this.opts.onFlush?.(changed);
      } catch (err) {
        // Re-queue the failed keys (unless a newer value already superseded).
        for (const [k, v] of Object.entries(changed)) {
          if (!(k in this.pending)) this.pending[k] = v;
        }
        this.opts.onError?.(err);
        throw err;
      } finally {
        this.inFlight = null;
      }
    })();
    await this.inFlight.catch(() => {});
  }
}
