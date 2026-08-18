// Typed SSE client for GET /api/v1/stream.
//
// EventSource cannot set an Authorization header, so — exactly as the built-in
// /rundown client does — the token travels as a query param. The controller's
// hub emits named events (`event: item.updated\ndata: {json}\n\n`); the browser
// EventSource surfaces those via addEventListener(name). We also auto-reconnect
// with backoff since broadcast shifts and Wi-Fi blips are expected on a studio
// LAN.

import type { RundownEvent } from "./types.js";

/** Every dotted event the controller currently broadcasts, plus `hello`. */
export const RUNDOWN_EVENTS = [
  "hello",
  "rundown.created",
  "rundown.updated",
  "rundown.deleted",
  "rundown.changed",
  "item.created",
  "item.updated",
  "item.deleted",
  "item.reordered",
  "item.trigger",
  "item.editing",
  "group.created",
  "group.updated",
  "group.deleted",
  "group.reordered",
  "asset.created",
  "asset.updated",
  "asset.deleted",
  "lock.changed",
  "presence.update",
] as const;

export type RundownEventName = (typeof RUNDOWN_EVENTS)[number];

/** Connection lifecycle state. */
export type StreamState = "connecting" | "open" | "closed";

export interface StreamOptions {
  /** Scope the stream to one rundown. Omit for all rundowns. */
  rundownId?: number;
  /** Called for every parsed event (after any specific listeners). */
  onEvent?: (e: RundownEvent) => void;
  onOpen?: () => void;
  onError?: (err: unknown) => void;
  /** Fired whenever the connection state changes. */
  onState?: (state: StreamState) => void;
  /** Reconnect backoff bounds (ms). */
  minRetryMs?: number;
  maxRetryMs?: number;
  /** Apply ±50% random jitter to each backoff delay (default true). */
  jitter?: boolean;
  /** Give up after this many consecutive failed reconnects (default: Infinity). */
  maxRetries?: number;
}

type Listener = (e: RundownEvent) => void;

/**
 * A live connection to the rundown SSE stream. Construct via
 * `client.stream(...)`. Call `.on(name, cb)` to subscribe, `.close()` to stop.
 */
export class RundownStream {
  private es: EventSource | null = null;
  private closed = false;
  private retryMs: number;
  private attempts = 0;
  private _state: StreamState = "connecting";
  private readonly minRetryMs: number;
  private readonly maxRetryMs: number;
  private readonly maxRetries: number;
  private readonly jitter: boolean;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly opts: StreamOptions = {},
  ) {
    this.minRetryMs = opts.minRetryMs ?? 1000;
    this.maxRetryMs = opts.maxRetryMs ?? 15000;
    this.maxRetries = opts.maxRetries ?? Infinity;
    this.jitter = opts.jitter ?? true;
    this.retryMs = this.minRetryMs;
    this.connect();
  }

  /** Current connection state. */
  get state(): StreamState {
    return this._state;
  }

  /** Consecutive failed reconnect attempts (resets to 0 on a good connection). */
  get reconnectAttempts(): number {
    return this.attempts;
  }

  private setState(next: StreamState): void {
    if (this._state === next) return;
    this._state = next;
    this.opts.onState?.(next);
  }

  private streamUrl(): string {
    const u = new URL(this.baseUrl.replace(/\/+$/, "") + "/stream");
    u.searchParams.set("token", this.token);
    if (this.opts.rundownId !== undefined) {
      u.searchParams.set("rundownId", String(this.opts.rundownId));
    }
    return u.toString();
  }

  private connect(): void {
    if (this.closed) return;
    this.setState("connecting");
    const es = new EventSource(this.streamUrl());
    this.es = es;

    es.onopen = () => {
      this.retryMs = this.minRetryMs; // reset backoff on a good connection
      this.attempts = 0;
      this.setState("open");
      this.opts.onOpen?.();
    };

    // Register a handler for each named event the controller emits.
    for (const name of RUNDOWN_EVENTS) {
      es.addEventListener(name, (ev) => this.dispatch(name, ev as MessageEvent));
    }

    es.onerror = (err) => {
      this.opts.onError?.(err);
      // EventSource auto-reconnects while CONNECTING; on a hard close we rebuild.
      if (es.readyState === EventSource.CLOSED) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.es?.close();
    this.es = null;

    if (this.attempts >= this.maxRetries) {
      this.opts.onError?.(new Error("stream: max reconnect attempts reached"));
      this.close();
      return;
    }
    this.attempts++;
    this.setState("connecting");

    const base = this.retryMs;
    // Exponential growth for next time.
    this.retryMs = Math.min(this.retryMs * 2, this.maxRetryMs);
    // ±50% jitter avoids a thundering herd when many clients drop together.
    const delay = this.jitter ? base * (0.5 + Math.random()) : base;
    setTimeout(() => this.connect(), delay);
  }

  private dispatch(name: string, ev: MessageEvent): void {
    let data: Record<string, unknown> = {};
    try {
      data = ev.data ? JSON.parse(ev.data) : {};
    } catch {
      /* keepalive comments and malformed frames are ignored */
    }
    const parsed: RundownEvent = { event: name, data };
    this.listeners.get(name)?.forEach((cb) => cb(parsed));
    this.listeners.get("*")?.forEach((cb) => cb(parsed));
    this.opts.onEvent?.(parsed);
  }

  /** Subscribe to one event name, or "*" for all. Returns an unsubscribe fn. */
  on(name: RundownEventName | "*", cb: Listener): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(cb);
    return () => set!.delete(cb);
  }

  close(): void {
    this.closed = true;
    this.es?.close();
    this.es = null;
    this.listeners.clear();
    this.setState("closed");
  }
}
