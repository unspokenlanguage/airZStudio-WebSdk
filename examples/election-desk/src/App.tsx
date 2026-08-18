// Election Desk — reference control app.
//
// Demonstrates the whole @airz/rundown-sdk flow against a live controller:
//   1. login                    → bearer token
//   2. pick rundown + item      → the target whose bindings we drive
//   3. type vote counts         → BindingSync diffs + PATCHes .../data (hot-apply)
//   4. fire an on-air trigger   → POST .../trigger (operator role)
//   5. live SSE feed            → reflects our own + others' changes
//
// The "pull" side (a real election feed) is out of scope here — the number
// inputs stand in for whatever data source a customer would wire up.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createClient,
  type AirzClient,
  type BindingSync,
  type Rundown,
  type RundownItem,
  type RundownStream,
} from "@airz/rundown-sdk";
import {
  ANIMATE_IN_TRIGGER,
  DEFAULTS,
  HEADLINE_BINDING,
  SEED_PARTIES,
  type Party,
} from "./config.js";

type Conn = "out" | "connecting" | "in";

export function App() {
  const [client, setClient] = useState<AirzClient | null>(null);
  const [who, setWho] = useState<string>("");
  return (
    <div style={S.page}>
      <header style={S.header}>
        <span style={S.brand}>airZ · Election Desk</span>
        <span style={S.sub}>
          {who ? `signed in as ${who}` : "reference control app"}
        </span>
      </header>
      {client ? (
        <Desk client={client} />
      ) : (
        <Login
          onLogin={(c, u) => {
            setClient(c);
            setWho(u);
          }}
        />
      )}
    </div>
  );
}

function Login({ onLogin }: { onLogin: (c: AirzClient, user: string) => void }) {
  const [baseUrl, setBaseUrl] = useState(DEFAULTS.baseUrl);
  const [username, setUsername] = useState(DEFAULTS.username);
  const [password, setPassword] = useState(DEFAULTS.password);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const c = createClient({ baseUrl });
      const s = await c.auth.login(username, password);
      onLogin(c, s.user.username);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={S.card}>
      <h2 style={S.h2}>Connect to controller</h2>
      <label style={S.label}>Controller URL</label>
      <input style={S.input} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      <label style={S.label}>Username</label>
      <input style={S.input} value={username} onChange={(e) => setUsername(e.target.value)} />
      <label style={S.label}>Password</label>
      <input
        style={S.input}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {err && <div style={S.error}>{err}</div>}
      <button style={S.btn} disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function Desk({ client }: { client: AirzClient }) {
  const [rundowns, setRundowns] = useState<Rundown[]>([]);
  const [rundownId, setRundownId] = useState<number | null>(null);
  const [items, setItems] = useState<RundownItem[]>([]);
  const [itemId, setItemId] = useState<number | null>(null);

  const [parties, setParties] = useState<Party[]>(SEED_PARTIES);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [headline, setHeadline] = useState("");
  const [conn, setConn] = useState<Conn>("out");
  const [feed, setFeed] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const syncRef = useRef<BindingSync | null>(null);
  const streamRef = useRef<RundownStream | null>(null);

  // Load rundowns once.
  useEffect(() => {
    client.rundowns
      .list()
      .then(setRundowns)
      .catch((e) => setErr(String(e)));
  }, [client]);

  // Load items when a rundown is chosen.
  useEffect(() => {
    if (rundownId == null) return;
    client.items
      .list(rundownId)
      .then(setItems)
      .catch((e) => setErr(String(e)));
  }, [client, rundownId]);

  // Build a BindingSync + open the SSE stream when the target item is chosen.
  useEffect(() => {
    if (rundownId == null || itemId == null) return;

    const target = items.find((i) => i.id === itemId);
    const sync = client.items.bindingSync({
      rundownId,
      itemId,
      debounceMs: 120, // coalesce fast typing into one PATCH
      onFlush: (changed) =>
        pushFeed(`→ pushed ${Object.keys(changed).join(", ")}`),
      onError: (e) => setErr(String(e)),
    });
    if (target) sync.prime(target.data); // diff against current on-air values
    syncRef.current = sync;

    const stream = client.stream({
      rundownId,
      onOpen: () => setConn("in"),
      onError: () => setConn("connecting"),
    });
    setConn("connecting");
    const off = stream.on("*", (ev) => {
      if (ev.event === "hello") return;
      pushFeed(`◂ ${ev.event}`);
    });
    streamRef.current = stream;

    return () => {
      off();
      stream.close();
      streamRef.current = null;
      syncRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, rundownId, itemId]);

  const pushFeed = useCallback((line: string) => {
    setFeed((f) => [`${new Date().toLocaleTimeString()}  ${line}`, ...f].slice(0, 40));
  }, []);

  // Push a single party's vote count via the diffing sync.
  const setVote = (p: Party, value: number) => {
    setVotes((v) => ({ ...v, [p.id]: value }));
    syncRef.current?.set({ [p.binding]: value });
  };

  const pushHeadline = (text: string) => {
    setHeadline(text);
    syncRef.current?.set({ [HEADLINE_BINDING]: text });
  };

  const total = useMemo(
    () => Object.values(votes).reduce((a, b) => a + (b || 0), 0),
    [votes],
  );

  const fireTrigger = async () => {
    if (rundownId == null || itemId == null) return;
    try {
      await client.items.trigger(rundownId, itemId, ANIMATE_IN_TRIGGER);
      pushFeed(`⚡ trigger ${ANIMATE_IN_TRIGGER}`);
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div style={S.grid}>
      <section style={S.card}>
        <h2 style={S.h2}>Target</h2>
        <label style={S.label}>Rundown</label>
        <select
          style={S.input}
          value={rundownId ?? ""}
          onChange={(e) => {
            setRundownId(Number(e.target.value) || null);
            setItemId(null);
          }}
        >
          <option value="">— select —</option>
          {rundowns.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.itemCount})
            </option>
          ))}
        </select>

        <label style={S.label}>Item</label>
        <select
          style={S.input}
          value={itemId ?? ""}
          onChange={(e) => setItemId(Number(e.target.value) || null)}
          disabled={rundownId == null}
        >
          <option value="">— select —</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title ?? `Item ${i.id}`} · {i.type}
            </option>
          ))}
        </select>

        <div style={S.connRow}>
          <span style={{ ...S.dot, background: CONN_COLOR[conn] }} />
          <span style={S.sub}>
            live sync {conn === "in" ? "connected" : conn === "connecting" ? "connecting…" : "off"}
          </span>
        </div>
        {err && <div style={S.error}>{err}</div>}
      </section>

      <section style={S.card}>
        <h2 style={S.h2}>Vote counts</h2>
        <label style={S.label}>Headline binding</label>
        <input
          style={S.input}
          value={headline}
          placeholder="LIVE RESULTS"
          disabled={itemId == null}
          onChange={(e) => pushHeadline(e.target.value)}
        />
        <div style={{ marginTop: 14 }}>
          {parties.map((p) => (
            <div key={p.id} style={S.partyRow}>
              <span style={{ ...S.swatch, background: p.color }} />
              <input
                style={{ ...S.input, flex: 1 }}
                value={p.name}
                onChange={(e) =>
                  setParties((ps) =>
                    ps.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)),
                  )
                }
              />
              <input
                style={{ ...S.input, width: 110 }}
                type="number"
                min={0}
                value={votes[p.id] ?? 0}
                disabled={itemId == null}
                onChange={(e) => setVote(p, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
        <div style={S.totalRow}>
          <span style={S.sub}>total</span>
          <strong>{total.toLocaleString()}</strong>
        </div>
        <button style={S.btn} disabled={itemId == null} onClick={fireTrigger}>
          Fire “{ANIMATE_IN_TRIGGER}” (operator)
        </button>
      </section>

      <section style={S.card}>
        <h2 style={S.h2}>Live feed</h2>
        <div style={S.feed}>
          {feed.length === 0 && <div style={S.sub}>waiting for events…</div>}
          {feed.map((line, i) => (
            <div key={i} style={S.feedLine}>
              {line}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const CONN_COLOR: Record<Conn, string> = {
  in: "#10b981",
  connecting: "#f59e0b",
  out: "#71717a",
};

// Inline styles keep the reference app single-file and dependency-free.
const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0a0a0f",
    color: "#e4e4e7",
    fontFamily: "Inter, -apple-system, Segoe UI, sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "baseline",
    gap: 14,
    padding: "16px 28px",
    borderBottom: "1px solid #1c1c22",
  },
  brand: { fontSize: 15, fontWeight: 700, color: "#a78bfa" },
  sub: { fontSize: 12, color: "#71717a" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 16,
    padding: 28,
  },
  card: {
    background: "#141419",
    border: "1px solid #27272a",
    borderRadius: 12,
    padding: 20,
    maxWidth: 460,
    margin: "24px auto",
    display: "block",
  },
  h2: { fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#a1a1aa", marginBottom: 12 },
  label: { display: "block", fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 0.5, margin: "12px 0 4px" },
  input: {
    width: "100%",
    background: "#0e0e13",
    border: "1px solid #27272a",
    color: "#e4e4e7",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 13,
    boxSizing: "border-box",
  },
  btn: {
    marginTop: 16,
    width: "100%",
    background: "#6366f1",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  error: { marginTop: 12, color: "#ef4444", fontSize: 12 },
  connRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 16 },
  dot: { width: 8, height: 8, borderRadius: "50%" },
  partyRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  swatch: { width: 12, height: 12, borderRadius: 3, flex: "0 0 auto" },
  totalRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 2px" },
  feed: { maxHeight: 320, overflowY: "auto", fontFamily: "monospace", fontSize: 12 },
  feedLine: { padding: "3px 0", borderBottom: "1px solid #1c1c22", color: "#a1a1aa" },
};
