// Connections: the persisted answer to "which panel drives which item?".
//
// A panel (e.g. "general-ticker", "city-results") is bound to a concrete
// (rundownId, itemId). Bindings are chosen either by an operator at runtime
// (live dropdowns → saved in a ConnectionStore) or automatically by matching a
// template name / MOS id. The map is small, human-editable state — keep it
// outside the source feed and outside the graphic.

import type { AirzClient } from "./client.js";
import type { PanelTarget } from "./mapping.js";
import type { RundownItem } from "./types.js";

/** One saved panel→item binding. */
export interface Connection extends PanelTarget {
  panelId: string;
}

/** Pluggable persistence for connections. */
export interface ConnectionStore {
  all(): Connection[];
  get(panelId: string): Connection | undefined;
  set(conn: Connection): void;
  remove(panelId: string): void;
}

/** In-memory store (tests, SSR, or when you persist elsewhere). */
export function memoryConnections(initial: Connection[] = []): ConnectionStore {
  const map = new Map<string, Connection>(initial.map((c) => [c.panelId, c]));
  return {
    all: () => [...map.values()],
    get: (id) => map.get(id),
    set: (c) => void map.set(c.panelId, c),
    remove: (id) => void map.delete(id),
  };
}

/** Browser store backed by localStorage. */
export function localStorageConnections(
  key = "airz.connections",
): ConnectionStore {
  const read = (): Connection[] => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Connection[]) : [];
    } catch {
      return [];
    }
  };
  const write = (list: Connection[]) =>
    localStorage.setItem(key, JSON.stringify(list));

  return {
    all: read,
    get: (id) => read().find((c) => c.panelId === id),
    set: (c) => {
      const list = read().filter((x) => x.panelId !== c.panelId);
      list.push(c);
      write(list);
    },
    remove: (id) => write(read().filter((c) => c.panelId !== id)),
  };
}

/**
 * Auto-bind by convention: find the item in a rundown whose template name
 * matches `pattern` (string = case-insensitive contains; or a RegExp). Lets you
 * pin "general-ticker" → the item built from the "General Ticker" template
 * without an operator picking it each show.
 */
export async function findItemByTemplateName(
  client: AirzClient,
  rundownId: number,
  pattern: string | RegExp,
): Promise<RundownItem | undefined> {
  const items = await client.items.list(rundownId);
  const withTpl = items.filter((i) => i.templateId != null);

  const names = new Map<number, string>();
  await Promise.all(
    [...new Set(withTpl.map((i) => i.templateId!))].map(async (tid) => {
      try {
        const tpl = await client.templates.get(tid);
        names.set(tid, tpl.name);
      } catch {
        /* skip templates we can't read */
      }
    }),
  );

  const test =
    typeof pattern === "string"
      ? (name: string) => name.toLowerCase().includes(pattern.toLowerCase())
      : (name: string) => pattern.test(name);

  return withTpl.find((i) => {
    const n = names.get(i.templateId!);
    return n != null && test(n);
  });
}

/**
 * Resolve a set of panels to targets: prefer a saved connection, else fall back
 * to convention matching. Returns the panels still missing a target so the UI
 * can prompt the operator.
 */
export async function resolveTargets(
  client: AirzClient,
  store: ConnectionStore,
  panels: { panelId: string; rundownId?: number; templateNameHint?: string | RegExp }[],
): Promise<{ resolved: Connection[]; missing: string[] }> {
  const resolved: Connection[] = [];
  const missing: string[] = [];
  for (const p of panels) {
    const saved = store.get(p.panelId);
    if (saved) {
      resolved.push(saved);
      continue;
    }
    if (p.rundownId != null && p.templateNameHint != null) {
      const item = await findItemByTemplateName(client, p.rundownId, p.templateNameHint);
      if (item) {
        const conn: Connection = {
          panelId: p.panelId,
          rundownId: p.rundownId,
          itemId: item.id,
        };
        store.set(conn);
        resolved.push(conn);
        continue;
      }
    }
    missing.push(p.panelId);
  }
  return { resolved, missing };
}
