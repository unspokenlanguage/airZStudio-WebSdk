# airZ Studio HTML/JS Web Plugin

Build customer-specific **LAN control apps** that drive airZ Studio broadcast
graphics — by pushing data into a playlist item's **data bindings** through the
controller's Rundown API (`http://<controller>:3467/api/v1`). No controller
release per customer; apps are hosted separately and just hit the API.

> This generalizes the built-in `/rundown` journalist client into a reusable,
> framework-agnostic SDK + reference apps that live outside the controller
> binary.


npm install && npm run build:libs   # both packages
npm run dev:2023   

## Layout

| Path | What |
|------|------|
| [`DESIGN_GOAL.md`](DESIGN_GOAL.md) | Goal, scope decisions, architecture, roadmap. |
| [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) | Professional implementation guide with examples. |
| [`docs/MULTI_PANEL.md`](docs/MULTI_PANEL.md) | Connecting many HTML panels to many playlist items (mapping + images). |
| [`docs/SYNC_WORKFLOW.md`](docs/SYNC_WORKFLOW.md) | Two-way control inputs (watched) vs one-way data outputs; `LinkedItem`. |
| [`docs/REALTIME.md`](docs/REALTIME.md) | Hardened stream, `RundownMirror`, `PresenceKeeper`, `LockManager`. |
| [`docs/PUBLISHING.md`](docs/PUBLISHING.md) | Building and publishing the packages to a private registry. |
| [`sdk/`](sdk) | `@airz/rundown-sdk` — the TypeScript client (auth, data push, triggers, SSE, diffing, panel mapping, `LinkedItem`). |
| [`packages/config-ui/`](packages/config-ui) | `@airz/config-ui` — mountable `<AirzConfigurator>` overlay to configure the SDK visually. |
| [`examples/election-desk/`](examples/election-desk) | React reference app — single-item data desk. |
| [`examples/election-2023/`](examples/election-2023) | React reference app — visual config overlay, general ticker + city → county (ilçe), images, live City-Code control. |

## Quick start

```bash
npm install
npm run build:sdk
npm run dev:election    # set Controller URL to http://<controller-ip>:3467
```

```ts
import { createClient } from "@airz/rundown-sdk";

const client = createClient({ baseUrl: "http://192.168.1.50:3467" });
await client.auth.login("desk-op", "••••••");

const [rundown] = await client.rundowns.list();
const [item] = await client.items.list(rundown.id);

await client.items.setData(rundown.id, item.id, { "Headline": "LIVE RESULTS" });
await client.items.trigger(rundown.id, item.id, "Animate-In");
```

See [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) for the full guide:
authentication & roles, discovering bindings, efficient pushing with
`BindingSync`, live SSE sync, connecting a real data source, the worked
Election Desk example, the API reference, and troubleshooting.

## Status

- **P1 — done:** SDK (auth, data push, triggers, SSE, `BindingSync` diffing) +
  single-item React example.
- **P2 — done:** panel-mapping layer (`PanelBinder`, `PanelSpec`, `repeat`,
  `image()`), connections (`ConnectionStore`, auto-bind by template name), image
  resolvers (pass-through / upload-and-cache), and the multi-panel `election-2023`
  example. See [`docs/MULTI_PANEL.md`](docs/MULTI_PANEL.md).
- **P2.1 — done:** visual configurator (`@airz/config-ui`
  `<AirzConfigurator>`) — set controller URL, pick rundown/item, map bindings →
  source per panel; plus the synchronous control/data workflow (`LinkedItem`,
  config `direction:"in"`), see [`docs/SYNC_WORKFLOW.md`](docs/SYNC_WORKFLOW.md).
- **P3 — done:** publishable builds (`prepublishOnly`, per-package READMEs,
  LICENSE, dry-run verified), hardened SSE stream (state + jittered backoff +
  retry cap), realtime helpers (`RundownMirror` with optimistic overlay,
  `PresenceKeeper`, `LockManager`), and lock/presence/editing API methods. See
  [`docs/REALTIME.md`](docs/REALTIME.md) and [`docs/PUBLISHING.md`](docs/PUBLISHING.md).
