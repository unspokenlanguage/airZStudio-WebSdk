# @airz/rundown-sdk

Framework-agnostic TypeScript client for the **airZ Studio Rundown API**
(`http://<controller>:3467/api/v1`). Build LAN control apps that push data into
playlist-item data bindings, fire triggers, and stay in sync over SSE.

Zero runtime dependencies. Browser-first (uses global `fetch` / `EventSource`).

```bash
npm install @airz/rundown-sdk
```

```ts
import { createClient } from "@airz/rundown-sdk";

const client = createClient({ baseUrl: "http://192.168.1.50:3467" });
await client.auth.login("desk-op", "••••••");

const [rundown] = await client.rundowns.list();
const [item] = await client.items.list(rundown.id);

// One-way data push — hot-applies to the live preview/program.
await client.items.setData(rundown.id, item.id, { Headline: "LIVE RESULTS" });
await client.items.trigger(rundown.id, item.id, "Animate-In"); // operator role
```

## What's inside

| Area | API |
|------|-----|
| Auth | `client.auth.login/logout/me` |
| Rundowns | `client.rundowns.list/get/create/presence` |
| Items | `client.items.list/get/setData/trigger/update/lock/unlock/setEditing` |
| Templates | `client.templates.list/get` (binding schema) |
| Assets | `client.assets.upload` (image bindings) |
| Efficient push | `client.items.bindingSync(...)` — diffs, only sends changes |
| Panel mapping | `PanelBinder`, `PanelSpec`, `repeat`, `image()` |
| Config-driven | `MappingConfig`, `configToPanelSpec`, `selectBy`, `localStorageConfig` |
| Control/data sync | `LinkedItem` — watch control inputs, push data one-way |
| Realtime | `RundownStream`, `RundownMirror`, `PresenceKeeper`, `LockManager` |
| Connections | `ConnectionStore`, `findItemByTemplateName`, `resolveTargets` |

## Docs

Full guides live in the repo:
`docs/IMPLEMENTATION.md`, `docs/MULTI_PANEL.md`, `docs/SYNC_WORKFLOW.md`,
`docs/REALTIME.md`.
