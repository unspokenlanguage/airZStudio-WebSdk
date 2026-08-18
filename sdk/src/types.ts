// Types mirrored from the controller's RundownApi serializers
// (lib/services/api/rundown_api.dart). Field names match the JSON on the wire.

/** Server-enforced roles. Lower privilege ordering is enforced controller-side. */
export type ApiRole =
  | "superadmin"
  | "admin"
  | "producer"
  | "operator"
  | "journalist"
  | "readonly"
  | "graphics"
  | "breakingnews";

export interface Session {
  token: string;
  user: { username: string; role: ApiRole };
}

/** A data-binding type as declared by a template. */
export type BindingType =
  | "text"
  | "string"
  | "number"
  | "color"
  | "image"
  | "trigger"
  | "action"
  | (string & {}); // forward-compatible with new controller types

/** One declared binding on a template: `dataBindings[key]`. */
export interface BindingSchema {
  type: BindingType;
  value?: unknown;
  [k: string]: unknown;
}

/** A concrete override value stored on an item, in the controller's shape. */
export interface TypedValue {
  type: BindingType;
  value: unknown;
}

/**
 * A flat binding payload accepted by `PATCH .../items/<id>/data`.
 * Values may be BARE (server infers the type from the template) or explicit
 * `{ type, value }`. Both are accepted by the controller's `_updateItemData`.
 */
export type BindingData = Record<string, unknown | TypedValue>;

export type RundownStatus = "draft" | "ready" | "onair" | (string & {});

export interface Rundown {
  id: number;
  name: string;
  mosRoId?: string | null;
  showDate?: string | null;
  channel?: string | null;
  status: RundownStatus;
  itemCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RundownGroup {
  id: number;
  name: string;
  order: number;
  isCollapsed: boolean;
}

/** Mirrors PlaylistItem.ContentType on the controller. */
export type ContentType =
  | "rive"
  | "localVideo"
  | "webUrl"
  | "cameraSource"
  | "ndiSource"
  | "scene"
  | "appWindow"
  | "map"
  | "audioStream"
  | (string & {});

export interface RundownItem {
  id: number;
  rundownId: number;
  order: number;
  callId?: number | null;
  groupId?: number | null;
  title?: string | null;
  script?: string | null;
  presenter?: string | null;
  templateId?: number | null;
  type: ContentType;
  durationMs?: number | null;
  enabled: boolean;
  status: string;
  lockedBy?: string | null;
  /** Flat binding overrides currently stored on the item. */
  data: BindingData;
}

/** Full rundown payload from `GET /rundowns/<id>`. */
export interface RundownDetail extends Rundown {
  items: RundownItem[];
  groups: RundownGroup[];
  presence: string[];
  locks: Record<string, string>;
}

export interface TemplateSummary {
  id: number;
  templateId: string;
  name: string;
  category?: string | null;
  isFullScreen: boolean;
  isDownloaded: boolean;
  hasThumbnail: boolean;
  fileUrl: string;
  downloadUrl?: string | null;
  thumbnailUrl?: string | null;
  triggers: unknown[];
  /** `{ key: { type, value } }` — the bindable-property schema. */
  dataBindings: Record<string, BindingSchema>;
  breakingNewsApproved: boolean;
}

export interface TemplateDetail extends TemplateSummary {
  inputs?: unknown;
  defaultValues?: Record<string, unknown> | null;
  tags: string[];
}

/** A parsed SSE frame. `event` is the dotted name; `data` is the JSON payload. */
export interface RundownEvent {
  event: string;
  data: Record<string, unknown> & { rundownId?: number | null };
}
