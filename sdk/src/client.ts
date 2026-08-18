// AirzClient: the top-level entry point. Wraps the Rundown API (/api/v1) into
// typed resource namespaces plus a live SSE stream and diffing binding-sync.

import { Http } from "./http.js";
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

  constructor(opts: ClientOptions) {
    this.http = new Http(normalizeBase(opts.baseUrl), opts.token ?? null);
    this.token = opts.token ?? null;
    this.auth = new AuthApi(this.http, this);
    this.rundowns = new RundownsApi(this.http);
    this.items = new ItemsApi(this.http);
    this.templates = new TemplatesApi(this.http);
    this.assets = new AssetsApi(this.http);
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
  ): Promise<RundownItem> {
    return this.http.request(
      `/rundowns/${rundownId}/items/${itemId}/data`,
      { method: "PATCH", body: { data } },
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
  ): Promise<void> {
    await this.http.request(
      `/rundowns/${rundownId}/items/${itemId}/trigger`,
      { method: "POST", body: { trigger: triggerName } },
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

  /** A diffing writer bound to one item — sends only changed bindings. */
  bindingSync(opts: BindingSyncOptions): BindingSync {
    return new BindingSync(
      (rundownId, itemId, data) => this.setData(rundownId, itemId, data),
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

/** Convenience factory. */
export function createClient(opts: ClientOptions): AirzClient {
  return new AirzClient(opts);
}
