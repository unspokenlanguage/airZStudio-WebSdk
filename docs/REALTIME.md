# Realtime: stream, mirror, presence & locks

**Requires:** `@airz/rundown-sdk` ≥ 0.1.0.

Beyond one-off pushes, a control app usually wants to *reflect* live state: who
else is editing, what the current values are, and whether an item is locked.
These helpers turn the raw SSE stream into state you can bind a UI to.

---

## 1. Hardened stream

`client.stream()` returns a `RundownStream` with connection state and resilient
reconnection (exponential backoff + ±50% jitter, so a fleet of clients doesn't
reconnect in lockstep after a blip).

```ts
const stream = client.stream({
  rundownId,
  onState: (s) => setBadge(s),   // "connecting" | "open" | "closed"
  onError: (e) => console.warn(e),
  maxRetries: Infinity,          // or a number to give up
  jitter: true,
});

stream.state;              // current state
stream.reconnectAttempts;  // consecutive failures (0 when healthy)

stream.on("item.updated", (e) => { /* … */ });
stream.on("*", (e) => log(e.event));
stream.close();
```

---

## 2. RundownMirror — a reactive snapshot

Keeps `{ items, groups, presence, locks, ready }` in sync automatically:
structural events trigger a debounced re-fetch; presence and lock events apply
directly. Ideal to drive a rundown list or an item picker that always reflects
the controller.

```ts
import { RundownMirror } from "@airz/rundown-sdk";

const mirror = new RundownMirror(client, { rundownId });

const off = mirror.subscribe((snap) => {
  render(snap.items, snap.presence, snap.locks);
});

// Optimistic UI: overlay a local change immediately; the next authoritative
// fetch replaces it. (Data still flows html→controller via setData/bindingSync.)
await client.items.setData(rundownId, itemId, { Headline: text });
mirror.applyLocal(itemId, { Headline: text });

off();
mirror.close();
```

Pass an existing `stream` in the options to share one connection across a mirror
and your own listeners; otherwise the mirror opens and owns its own.

---

## 3. PresenceKeeper — announce & observe presence

```ts
import { PresenceKeeper } from "@airz/rundown-sdk";

const presence = new PresenceKeeper(client, {
  rundownId,
  intervalMs: 15000,                 // server expires presence ~45s
  onPresence: (users) => setWhoIsHere(users),
}).start();

presence.present();  // last-known list
presence.stop();
```

---

## 4. LockManager — soft locks with auto-refresh

Soft locks are ENPS-style: advisory, TTL'd (~30s server-side). `LockManager`
acquires and keeps them alive so they don't expire mid-edit, and releases them
all on close.

```ts
import { LockManager } from "@airz/rundown-sdk";

const locks = new LockManager(client, { rundownId, refreshMs: 15000 });

if (await locks.acquire(itemId)) {
  // editing… lock is auto-refreshed in the background
  await locks.release(itemId);
} else {
  // held by someone else — reflect the holder from the mirror's `locks` map
}

await locks.close(); // release everything on unmount
```

`acquire` returns `false` on a `423` (held by another user). Combine with a
`RundownMirror` to show *who* holds it (`snapshot().locks[itemId]`).

---

## 5. Putting it together

```ts
const stream = client.stream({ rundownId });
const mirror = new RundownMirror(client, { rundownId, stream });
const presence = new PresenceKeeper(client, { rundownId }).start();
const locks = new LockManager(client, { rundownId });

// one stream, one snapshot, live presence, safe editing.
```

Remember the directional rule from `SYNC_WORKFLOW.md`: result/data bindings only
ever flow **html → controller**. The mirror is for *reading* structure,
presence, and control inputs — never for pulling result values back into the app
as truth.
