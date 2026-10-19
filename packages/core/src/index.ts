/**
 * Pure domain logic for the smart glasses software track.
 * No React and no native imports (Engineering Standards section 2.1).
 */
export const CORE_PACKAGE_VERSION = "0.0.0";

export type { EnvelopeHandler, GlassesLink, LinkStatus } from "./glasses-link.js";
export { CaptureIndicator } from "./capture-indicator.js";
export type { CaptureSessionType, IndicatorOffResult } from "./capture-indicator.js";
export { SpendCap } from "./spend-cap.js";
export type { SpendDecision } from "./spend-cap.js";
export {
  IDLE_STATE,
  applyCutoff,
  isCapturing,
  onGesture,
  speechStarted,
  startListeningSession,
  stopListeningSession,
} from "./glasses-state.js";
export type {
  Gesture,
  GlassesEffect,
  GlassesMode,
  GlassesState,
  GlassesTransition,
  ListeningSessionType,
} from "./glasses-state.js";
export { ProviderGateway, ProviderTimeout } from "./provider-gateway.js";
export type {
  GatewayErrorCode,
  GatewayOptions,
  GatewayResult,
  ProviderRun,
} from "./provider-gateway.js";
export { ALLOWED_LOG_FIELDS, REDACTED, redactText, toSafeLogEntry } from "./log-redaction.js";
export type { LogEntry, LogValue } from "./log-redaction.js";
export {
  TEMPORARY_RETENTION_MS,
  isTemporaryItemExpired,
  sweepTemporaryItems,
} from "./retention.js";
export type { TemporaryItem } from "./retention.js";
