// AirzClient: the top-level entry point. Wraps the Rundown API (/api/v1) into
// typed resource namespaces plus a live SSE stream and diffing binding-sync.

import { Http, ApiError } from "./http.js";
import { RundownStream, type StreamOptions } from "./stream.js";
import { BindingSync, type BindingSyncOptions } from "./sync.js";
import type {
  BindingData,
  Rundown,
  RundownDetail,
  RundownItem,
  Session,
  TemplateDetail,
  TemplateSummary,
} from "./types.js";

export interface ClientOptions {
  /**
   * Base URL of the Rundown API, e.g. `http://192.168.1.50:3467/api/v1`.
   * A bare `http://host:3467` is accepted and `/api/v1` is appended.
   */
  baseUrl: string;
  /** Pre-existing bearer token (skip login). */
  token?: string;
}

function normalizeBase(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  return /\/api\/v1$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
}

export class AirzClient {
  private readonly http: Http;
  private token: string | null;
  session: Session | null = null;

  readonly auth: AuthApi;
  readonly rundowns: RundownsApi;
  readonly items: ItemsApi;
  readonly templates: TemplatesApi;
  readonly assets: AssetsApi;
  readonly webConfigs: WebConfigsApi;

  constructor(opts: ClientOptions) {
    this.http = new Http(normalizeBase(opts.baseUrl), opts.token ?? null);
    this.token = opts.token ?? null;
    this.auth = new AuthApi(this.http, this);
    this.rundowns = new RundownsApi(this.http);
    this.items = new ItemsApi(this.http);
    this.templates = new TemplatesApi(this.http);
    this.assets = new AssetsApi(this.http);
    this.webConfigs = new WebConfigsApi(this.http);
  }

  /** Set/replace the bearer token used for subsequent requests + streams. */
  setToken(token: string | null): void {
    this.token = token;
    this.http.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  /** Open a live SSE stream. Throws if not authenticated. */
  stream(opts: StreamOptions = {}): RundownStream {
    if (!this.token) throw new Error("stream() requires a token — login first");
    return new RundownStream(this.http.baseUrl, this.token, opts);
  }
}

class AuthApi {
  constructor(
    private readonly http: Http,
    private readonly client: AirzClient,
  ) {}

  /** POST /auth/login — stores the token on the client on success. */
  async login(username: string, password: string): Promise<Session> {
    const session = await this.http.request<Session>("/auth/login", {
      method: "POST",
      body: { username, password },
    });
    this.client.setToken(session.token);
    this.client.session = session;
    return session;
  }

  /** POST /auth/logout — revokes the current token. */
  async logout(): Promise<void> {
    try {
      await this.http.request("/auth/logout", { method: "POST" });
    } finally {
      this.client.setToken(null);
      this.client.session = null;
    }
  }

  /** GET /auth/me */
  me(): Promise<{ user: Session["user"] }> {
    return this.http.request("/auth/me");
  }
}

class RundownsApi {
  constructor(private readonly http: Http) {}

  /** GET /rundowns — optionally filter by status/channel. */
  async list(filters?: { status?: string; channel?: string }): Promise<Rundown[]> {
    const res = await this.http.request<{ rundowns: Rundown[] }>("/rundowns", {
      query: filters,
    });
    return res.rundowns;
  }

  /** GET /rundowns/<id> — full detail incl. items, groups, presence, locks. */
  get(id: number): Promise<RundownDetail> {
    return this.http.request(`/rundowns/${id}`);
  }

  /** POST /rundowns (producer/journalist). */
  create(input: {
    name: string;
    showDate?: string;
    channel?: string;
    status?: string;
  }): Promise<Rundown> {
    return this.http.request("/rundowns", { method: "POST", body: input });
  }

  /**
   * POST /rundowns/<id>/presence — heartbeat that you are viewing this rundown.
   * Returns the current set of present usernames. Call periodically (the server
   * expires presence after ~45s).
   */
  async presence(rundownId: number): Promise<string[]> {
    const res = await this.http.request<{ present: string[] }>(
      `/rundowns/${rundownId}/presence`,
      { method: "POST" },
    );
    return res.present;
  }
}

class ItemsApi {
  constructor(private readonly http: Http) {}

  /** GET /rundowns/<id>/items */
  async list(rundownId: number): Promise<RundownItem[]> {
    const res = await this.http.request<{ items: RundownItem[] }>(
      `/rundowns/${rundownId}/items`,
    );
    return res.items;
  }

  /** Fetch one item's current state (there is no single-item GET route, so this
   * lists and finds — used to read live control-binding values). */
  async get(rundownId: number, itemId: number): Promise<RundownItem | undefined> {
    const items = await this.list(rundownId);
    return items.find((i) => i.id === itemId);
  }

  /** POST /rundowns/<id>/items — create a new item (write access required). */
  create(
    rundownId: number,
    input: {
      title?: string;
      type?: string;
      templateId?: number;
      durationMs?: number;
      groupId?: number;
      status?: string;
      data?: BindingData;
    } = {},
  ): Promise<RundownItem> {
    return this.http.request(`/rundowns/${rundownId}/items`, {
      method: "POST",
      body: input,
    });
  }

  /**
   * PATCH /rundowns/<id>/items/<itemId>/data — the core push. Hot-applies to
   * the live preview/program. Values may be bare or `{ type, value }`.
   */
  setData(
    rundownId: number,
    itemId: number,
    data: BindingData,
    options?: { mode?: "live" | "staged" },
  ): Promise<RundownItem> {
    return this.http.request(
      `/rundowns/${rundownId}/items/${itemId}/data`,
      {
        method: "PATCH",
        body: { data },
        // Only "staged" carries a query flag — the controller treats an absent
        // mode as a live, role-based write (preview + program/engine for on-air
        // items). Sending `?mode=live` would work too, but no-mode is the
        // canonical live path.
        query: options?.mode === "staged" ? { mode: "staged" } : undefined,
      },
    );
  }

  /** POST /rundowns/<id>/items/<itemId>/push_staged — takes staged data to live */
  pushStaged(
    rundownId: number,
    itemId: number,
  ): Promise<RundownItem> {
    return this.http.request(
      `/rundowns/${rundownId}/items/${itemId}/push_staged`,
      { method: "POST" },
    );
  }

  /**
   * POST /rundowns/<id>/items/<itemId>/trigger — fire a state-machine trigger
   * on the live engine. Requires the `operator` (or breakingnews) role.
   */
  async trigger(
    rundownId: number,
    itemId: number,
    triggerName: string,
    options?: { mode?: "live" | "staged"; flushStaged?: boolean },
  ): Promise<void> {
    // A STAGED trigger fires on the controller's preview only (like pressing the
    // native item-editor trigger button in staged) — it must NOT reach program,
    // so it carries `?mode=staged` and never flushes. A live trigger (default)
    // carries no mode and reaches program. `flushStaged` is an explicit opt-in to
    // promote staged data to air on fire; it's independent of preview/live.
    const query: Record<string, string> = {};
    if (options?.mode === "staged") query.mode = "staged";
    if (options?.flushStaged) query.flush_staged = "true";
    await this.http.request(
      `/rundowns/${rundownId}/items/${itemId}/trigger`,
      {
        method: "POST",
        body: { trigger: triggerName },
        query: Object.keys(query).length ? query : undefined,
      },
    );
  }

  /** PATCH /rundowns/<id>/items/<itemId> — metadata (title, duration, ...). */
  update(
    rundownId: number,
    itemId: number,
    updates: Partial<Pick<RundownItem, "title" | "durationMs" | "enabled" | "groupId">> &
      Record<string, unknown>,
  ): Promise<RundownItem> {
    return this.http.request(`/rundowns/${rundownId}/items/${itemId}`, {
      method: "PATCH",
      body: updates,
    });
  }

  /**
   * POST /rundowns/<id>/items/<itemId>/lock — acquire/refresh a soft lock
   * (ENPS-style; prevents concurrent edits). Throws ApiError(423) if another
   * user holds it. Requires write access.
   */
  lock(rundownId: number, itemId: number): Promise<{ ok: boolean; lockedBy?: string }> {
    return this.http.request(`/rundowns/${rundownId}/items/${itemId}/lock`, {
      method: "POST",
    });
  }

  /** DELETE /rundowns/<id>/items/<itemId>/lock — release a soft lock. */
  async unlock(rundownId: number, itemId: number): Promise<void> {
    await this.http.request(`/rundowns/${rundownId}/items/${itemId}/lock`, {
      method: "DELETE",
    });
  }

  /**
   * POST /rundowns/<id>/items/<itemId>/editing — ephemeral "is typing" hint
   * (never blocks). Broadcasts `item.editing` to other clients.
   */
  async setEditing(rundownId: number, itemId: number, active: boolean): Promise<void> {
    await this.http.request(`/rundowns/${rundownId}/items/${itemId}/editing`, {
      method: "POST",
      body: { active },
    });
  }

  bindingSync(opts: BindingSyncOptions): BindingSync {
    // Live vs staged is decided entirely by the PATCH mode: a live write reaches
    // program/engine (for on-air items), a staged write updates only the
    // controller preview. There is no implicit push-to-air here — the app calls
    // `pushStaged()` (or a `flush_staged` trigger) explicitly to promote staged
    // data to air.
    return new BindingSync(
      (rundownId, itemId, data, options) =>
        this.setData(rundownId, itemId, data, options),
      opts,
    );
  }
}

class TemplatesApi {
  constructor(private readonly http: Http) {}

  /** GET /templates */
  async list(query?: { search?: string; category?: string }): Promise<TemplateSummary[]> {
    const res = await this.http.request<{ templates: TemplateSummary[] }>(
      "/templates",
      { query },
    );
    return res.templates;
  }

  /** GET /templates/<id> — includes the `dataBindings` schema to bind against. */
  get(id: number): Promise<TemplateDetail> {
    return this.http.request(`/templates/${id}`);
  }
}

/** The subset of the asset upload response used for image bindings. */
export interface UploadedAsset {
  id: number;
  name: string;
  folder: string;
  type: string;
  /** Controller-local path the renderer resolves — use this for image bindings. */
  localPath: string;
  /** LAN URL to fetch the file (`/api/v1/assets/<id>/file`). */
  fileUrl: string;
}

class AssetsApi {
  constructor(private readonly http: Http) {}

  /**
   * GET /assets — list existing assets, optionally filtered by folder and type.
   */
  async list(query?: { folder?: string; type?: string }): Promise<UploadedAsset[]> {
    const res = await this.http.request<{ assets: UploadedAsset[] }>("/assets", {
      query,
    });
    return res.assets || [];
  }

  /**
   * POST /assets?name=&folder= — upload raw image/media bytes. The controller
   * copies the file into its managed store and returns a `localPath` the render
   * pipeline resolves, ideal for `image`-typed bindings.
   */
  upload(
    name: string,
    data: BlobPart,
    folder = "/default",
  ): Promise<UploadedAsset> {
    return this.http.request<UploadedAsset>("/assets", {
      method: "POST",
      query: { name, folder },
      rawBody: data instanceof Blob ? data : new Blob([data]),
    });
  }
}

export interface WebConfigEntry {
  key: string;
  value: unknown;
  updatedAt?: string;
}

/**
 * First-class controller-side config store (`/api/v1/web-configs`). This is the
 * clean home for web configs — no item pollution, no `{type,value}` wrapping,
 * no replace/wipe. When the controller exposes it, the remote-config helpers use
 * it automatically; otherwise they fall back to the dedicated-item stash.
 */
class WebConfigsApi {
  private _available?: boolean;

  constructor(private readonly http: Http) {}

  /** Whether the controller exposes the endpoint (probed once, then cached). */
  async available(): Promise<boolean> {
    if (this._available !== undefined) return this._available;
    try {
      await this.http.request<unknown>("/web-configs");
      this._available = true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) this._available = false;
      else return false; // transient error — do not cache
    }
    return this._available ?? false;
  }

  /** GET /web-configs — list stored config keys. */
  async keys(): Promise<string[]> {
    const res = await this.http.request<{ keys?: string[] }>("/web-configs");
    return res.keys ?? [];
  }

  /** GET /web-configs/<key> — undefined if not set. */
  async get(key: string): Promise<WebConfigEntry | undefined> {
    try {
      return await this.http.request<WebConfigEntry>(
        `/web-configs/${encodeURIComponent(key)}`,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return undefined;
      throw e;
    }
  }

  /** PUT /web-configs/<key> — create or replace. */
  async put(key: string, value: unknown): Promise<void> {
    await this.http.request(`/web-configs/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: { value },
    });
  }

  /** DELETE /web-configs/<key>. */
  async remove(key: string): Promise<void> {
    await this.http.request(`/web-configs/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
  }
}

/** Convenience factory. */
export function createClient(opts: ClientOptions): AirzClient {
  return new AirzClient(opts);
}
