// @airz/rundown-sdk — public surface.

export {
  AirzClient,
  createClient,
  type ClientOptions,
  type UploadedAsset,
} from "./client.js";
export {
  PanelBinder,
  image,
  pick,
  passthroughImages,
  uploadingImages,
  type PanelSpec,
  type PanelTarget,
  type PanelBinderOptions,
  type Field,
  type Repeat,
  type ImageRef,
  type ImageResolver,
  type From,
} from "./mapping.js";
export {
  memoryConnections,
  localStorageConnections,
  findItemByTemplateName,
  resolveTargets,
  type Connection,
  type ConnectionStore,
} from "./connections.js";
export {
  emptyConfig,
  configToPanelSpec,
  panelControls,
  localStorageConfig,
  describeTemplateBindings,
  type MappingConfig,
  type PanelConfig,
  type FieldConfig,
  type FormatKind,
  type SelectStep,
  type ConfigStore,
  type BindingInfo,
} from "./config.js";
export {
  LinkedItem,
  type LinkedItemOptions,
  type LinkContext,
  type ControlOrigin,
} from "./link.js";
export { Http, ApiError, type HttpOptions } from "./http.js";
export {
  RundownStream,
  RUNDOWN_EVENTS,
  type RundownEventName,
  type StreamOptions,
  type StreamState,
} from "./stream.js";
export {
  RundownMirror,
  PresenceKeeper,
  LockManager,
  type RundownSnapshot,
  type RundownMirrorOptions,
  type PresenceKeeperOptions,
  type LockManagerOptions,
} from "./realtime.js";
export { BindingSync, type BindingSyncOptions } from "./sync.js";
export type * from "./types.js";
