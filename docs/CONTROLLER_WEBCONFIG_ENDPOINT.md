# Controller change request: `/api/v1/web-configs` endpoint

**For:** whoever is implementing the controller (RiveAnimationClient) side.
**Why:** retire the fragile "config stashed in an item's databindings" workaround
(the item-stash gets wiped because `PATCH .../items/<id>/data` replaces the whole
override map, and values are wrapped as `{type,value}`). A tiny first-class KV
store fixes it cleanly.

The web SDK is **already endpoint-aware**: `client.webConfigs` uses this endpoint
when present and silently falls back to the item-stash when it's 404. Ship this
and the SDK upgrades automatically — no web-side change needed.

## Endpoints (mount under `/api/v1`)

| Method | Path | Body | Success | Notes |
|--------|------|------|---------|-------|
| GET | `/web-configs` | — | `{ "keys": ["mapping:election2023", …] }` | list keys; its mere 200 is the SDK's capability probe |
| GET | `/web-configs/<key>` | — | `{ "key": "...", "value": <json>, "updatedAt": "ISO" }` | **404** `{ "error": "not found" }` if unset |
| PUT | `/web-configs/<key>` | `{ "value": <any json> }` | `{ "ok": true, "updatedAt": "ISO" }` | create or replace |
| DELETE | `/web-configs/<key>` | — | `{ "ok": true }` | idempotent |

- `value` is stored **verbatim** (arbitrary JSON) — do **not** wrap it as
  `{type,value}` and do not coerce. The SDK stores a `MappingConfig` object here.
- `<key>` is an opaque string (URL-encoded). The SDK uses `mapping:<appId>`.
- Suggest a size cap (e.g. 256 KB/value) and a max key count.

## Realtime

On a successful PUT or DELETE, broadcast over the existing SSE hub so other
clients live-sync:

```dart
RundownRealtimeHub.instance.broadcast(
  rundownId: null,                 // global
  event: 'webconfig.updated',
  data: {'key': key},
);
```

The SDK already listens for `webconfig.updated` and re-fetches.

## Auth / roles

Reuse the existing middleware in `lib/services/api/rundown_api.dart`:

- **GET**: any authenticated session (even `readonly`).
- **PUT / DELETE**: write access — mirror `_requireWrite` (journalist/producer/
  admin). (Config editing is an operator/producer task.)

CORS is already handled by the pipeline's `_corsMiddleware`.

## Suggested implementation

1. **Router** — in `RundownApi._router` (`lib/services/api/rundown_api.dart`),
   alongside the other resources:

   ```dart
   r.get('/web-configs', _listWebConfigs);
   r.get('/web-configs/<key>', _getWebConfig);
   r.put('/web-configs/<key>', _putWebConfig);
   r.delete('/web-configs/<key>', _deleteWebConfig);
   ```

2. **Store** — a small `WebConfigStore` singleton persisting a JSON map
   `{ key: { value, updatedAt } }` to a file under the app-support dir (mirror
   `CustomWidgetStore` in `lib/services/custom_widget_store.dart`). Or an Isar
   collection if you prefer. Load once on boot.

3. **Handlers** (sketch):

   ```dart
   Future<Response> _getWebConfig(Request req, String key) async {
     final e = WebConfigStore.instance.get(Uri.decodeComponent(key));
     if (e == null) return _json(404, {'error': 'not found'});
     return _json(200, {'key': key, 'value': e.value, 'updatedAt': e.updatedAt});
   }

   Future<Response> _putWebConfig(Request req, String key) async {
     final deny = _requireWrite(req);
     if (deny != null) return deny;
     final body = await _readJson(req);
     if (!body.containsKey('value')) return _json(400, {'error': 'value required'});
     final e = await WebConfigStore.instance.put(Uri.decodeComponent(key), body['value']);
     _hub.broadcast(rundownId: null, event: 'webconfig.updated', data: {'key': key});
     return _json(200, {'ok': true, 'updatedAt': e.updatedAt});
   }
   ```

4. **(Optional) one-time migration** — on first boot after shipping, scan items
   for legacy `_airzWebConfig_*` keys and import them into the store, then the
   reserved `__airz_webconfig__` item can be deleted.

## Verifying against the SDK

Once shipped:

- `client.webConfigs.available()` returns `true` (the GET list 200s).
- `saveRemoteConfig` / `autoDiscoverRemoteConfig` / `loadRemoteConfig` /
  `discoverAndWatchRemoteConfig` all route through `/web-configs` automatically;
  no `__airz_webconfig__` item is created anymore.
- Cross-machine: PUT on PC1 → `webconfig.updated` SSE → PC2 re-fetches instantly.
