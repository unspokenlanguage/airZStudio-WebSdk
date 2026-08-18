// Realtime helpers built on the SSE stream: a reactive rundown mirror (with an
// optimistic overlay for snappy UIs), a presence heartbeat keeper, and a soft-
// lock manager with auto-refresh. These turn the raw event stream into state a
// UI can bind to directly.

import type { AirzClient } from "./client.js";
import { RundownStream } from "./stream.js";
import type { BindingData, RundownGroup, RundownItem } from "./types.js";

// ── RundownMirror ───────────────────────────────────────────────────────────

export interface RundownSnapshot {
  items: RundownItem[];
  groups: RundownGroup[];
  presence: string[];
  locks: Record<string, string>;
  /** True once the first fetch has completed. */
  ready: boolean;
}

export interface RundownMirrorOptions {
  rundownId: number;
  /** Reuse an existing stream; otherwise the mirror opens (and owns) its own. */
  stream?: RundownStream;
  /** Coalesce bursts of structural events before re-fetching (ms). Default 150. */
  refetchDebounceMs?: number;
}

type Sub = (snap: RundownSnapshot) => void;

/**
 * Keeps a live snapshot of a rundown in sync with the controller. Structural
 * events (item/group/rundown changes) trigger a debounced re-fetch; presence
 * and lock events are applied directly. Subscribe to re-render on any change.
 */
export class RundownMirror {
  private snap: RundownSnapshot = { items: [], groups: [], presence: [], locks: {}, ready: false };
  private overlay = new Map<number, BindingData>(); // itemId → optimistic data
  private readonly subs = new Set<Sub>();
  private readonly stream: RundownStream;
  private readonly ownsStream: boolean;
  private readonly offs: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    private readonly client: AirzClient,
    private readonly opts: RundownMirrorOptions,
  ) {
    this.ownsStream = !opts.stream;
    this.stream = opts.stream ?? client.stream({ rundownId: opts.rundownId });

    const structural = () => this.scheduleRefetch();
    for (const ev of [
      "item.created", "item.updated", "item.deleted", "item.reordered",
      "group.created", "group.updated", "group.deleted", "group.reordered",
      "rundown.updated", "rundown.changed",
    ] as const) {
      this.offs.push(this.stream.on(ev, structural));
    }
    this.offs.push(
      this.stream.on("presence.update", (e) => {
        const present = (e.data as { present?: string[] }).present;
        if (Array.isArray(present)) this.patch({ presence: present });
      }),
    );
    this.offs.push(
      this.stream.on("lock.changed", (e) => {
        const d = e.data as { itemId?: number; lockedBy?: string | null };
        if (d.itemId == null) return;
        const locks = { ...this.snap.locks };
        if (d.lockedBy) locks[d.itemId] = d.lockedBy;
        else delete locks[String(d.itemId)];
        this.patch({ locks });
      }),
    );

    void this.refresh();
  }

  /** Current snapshot (with any optimistic overlay applied to item data). */
  snapshot(): RundownSnapshot {
    if (this.overlay.size === 0) return this.snap;
    return {
      ...this.snap,
      items: this.snap.items.map((it) => {
        const ov = this.overlay.get(it.id);
        return ov ? { ...it, data: { ...it.data, ...ov } } : it;
      }),
    };
  }

  subscribe(cb: Sub): () => void {
    this.subs.add(cb);
    cb(this.snapshot());
    return () => this.subs.delete(cb);
  }

  /**
   * Optimistically overlay local data onto an item until the next authoritative
   * fetch. Use right after a write so the UI updates before the round-trip.
   */
  applyLocal(itemId: number, data: BindingData): void {
    this.overlay.set(itemId, { ...(this.overlay.get(itemId) ?? {}), ...data });
    this.emit();
  }

  /** Force an immediate re-fetch of the full rundown. */
  async refresh(): Promise<void> {
    if (this.closed) return;
    try {
      const detail = await this.client.rundowns.get(this.opts.rundownId);
      this.overlay.clear(); // authoritative data supersedes optimistic overlay
      this.snap = {
        items: detail.items,
        groups: detail.groups,
        presence: detail.presence ?? [],
        locks: detail.locks ?? {},
        ready: true,
      };
      this.emit();
    } catch {
      /* transient; a later event will trigger another refetch */
    }
  }

  private scheduleRefetch(): void {
    if (this.closed || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, this.opts.refetchDebounceMs ?? 150);
  }

  private patch(part: Partial<RundownSnapshot>): void {
    this.snap = { ...this.snap, ...part };
    this.emit();
  }

  private emit(): void {
    const s = this.snapshot();
    this.subs.forEach((cb) => cb(s));
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.offs.forEach((off) => off());
    this.subs.clear();
    if (this.ownsStream) this.stream.close();
  }
}

// ── PresenceKeeper ──────────────────────────────────────────────────────────

export interface PresenceKeeperOptions {
  rundownId: number;
  /** Heartbeat interval (ms). Server expires presence at ~45s. Default 15000. */
  intervalMs?: number;
  onPresence?: (present: string[]) => void;
}

/** Periodically announces presence on a rundown and reports who is present. */
export class PresenceKeeper {
  private timer: ReturnType<typeof setInterval> | null = null;
  private last: string[] = [];

  constructor(
    private readonly client: AirzClient,
    private readonly opts: PresenceKeeperOptions,
  ) {}

  start(): this {
    if (this.timer) return this;
    const beat = async () => {
      try {
        this.last = await this.client.rundowns.presence(this.opts.rundownId);
        this.opts.onPresence?.(this.last);
      } catch {
        /* ignore a missed heartbeat */
      }
    };
    void beat();
    this.timer = setInterval(beat, this.opts.intervalMs ?? 15000);
    return this;
  }

  present(): string[] {
    return this.last;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

// ── LockManager ─────────────────────────────────────────────────────────────

export interface LockManagerOptions {
  rundownId: number;
  /** Re-acquire held locks on this interval (server TTL ~30s). Default 15000. */
  refreshMs?: number;
}

/** Acquires/holds soft locks with auto-refresh so they don't expire mid-edit. */
export class LockManager {
  private readonly timers = new Map<number, ReturnType<typeof setInterval>>();

  constructor(
    private readonly client: AirzClient,
    private readonly opts: LockManagerOptions,
  ) {}

  /** Try to acquire (and keep refreshing) a lock. Returns false if held by another. */
  async acquire(itemId: number): Promise<boolean> {
    try {
      await this.client.items.lock(this.opts.rundownId, itemId);
    } catch {
      return false; // 423 (or other) → not acquired
    }
    if (!this.timers.has(itemId)) {
      const t = setInterval(() => {
        void this.client.items.lock(this.opts.rundownId, itemId).catch(() => {});
      }, this.opts.refreshMs ?? 15000);
      this.timers.set(itemId, t);
    }
    return true;
  }

  async release(itemId: number): Promise<void> {
    const t = this.timers.get(itemId);
    if (t) {
      clearInterval(t);
      this.timers.delete(itemId);
    }
    try {
      await this.client.items.unlock(this.opts.rundownId, itemId);
    } catch {
      /* best-effort */
    }
  }

  held(): number[] {
    return [...this.timers.keys()];
  }

  /** Release all held locks and stop refreshing. */
  async close(): Promise<void> {
    await Promise.all(this.held().map((id) => this.release(id)));
  }
}
