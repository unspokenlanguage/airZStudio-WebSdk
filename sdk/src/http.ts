// Minimal fetch wrapper: bearer auth, JSON in/out, typed errors.
// Browser-first (relies on global fetch). Zero runtime dependencies.

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface HttpOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON body — serialized automatically. */
  body?: unknown;
  /**
   * Raw request body (bytes/blob) sent as-is, no JSON encoding. Used for asset
   * uploads, which the controller reads as raw bytes with metadata in the query.
   * Takes precedence over `body`.
   */
  rawBody?: BodyInit;
  /** Extra query params (skips null/undefined). */
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
}

/** Holds base URL + current token; performs authenticated JSON requests. */
export class Http {
  baseUrl: string;
  token: string | null;

  constructor(baseUrl: string, token: string | null = null) {
    // Normalize: strip trailing slash so `${baseUrl}${path}` is predictable.
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  private url(path: string, query?: HttpOptions["query"]): string {
    const u = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== null && v !== undefined) u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }

  async request<T>(path: string, opts: HttpOptions = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    let body: BodyInit | undefined;
    if (opts.rawBody !== undefined) {
      body = opts.rawBody; // bytes/blob, sent verbatim (asset upload)
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    const res = await fetch(this.url(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: opts.signal,
    });

    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const msg =
        (parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as Record<string, unknown>).error)
          : res.statusText) || `HTTP ${res.status}`;
      throw new ApiError(res.status, msg, parsed);
    }
    return parsed as T;
  }
}
