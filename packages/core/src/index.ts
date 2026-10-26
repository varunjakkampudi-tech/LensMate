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
  SILENCE_TIMEOUT_MS,
  SPEECH_STOP_TARGET_MS,
  TRANSLATION_START_ANNOUNCEMENT,
  applyCutoff,
  applySilenceTimeout,
  captureSessionForEffect,
  isCapturing,
  listeningSessionOf,
  onGesture,
  onVoiceCommand,
  speechEnded,
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
  ListeningSessionStart,
  ListeningSessionType,
  VoiceCommand,
  VoiceCommandResult,
} from "./glasses-state.js";
export {
  checkSilenceTimer,
  recordSpeech,
  silenceRemainingMs,
  silentForMs,
  startSilenceTimer,
} from "./silence-timer.js";
export type { SilenceCheck, SilenceTimer } from "./silence-timer.js";
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
export * from "./measurement/targets.js";
export {
  captureToPhoneReport,
  evaluateByLanguage,
  interruptionCriterionMet,
  interruptionReport,
  intervalMs,
  latencyCriterionMet,
  latencyTotalReport,
} from "./measurement/evaluate.js";
export type { LanguageReport, MarkName, Marks, MeasuredAttempt } from "./measurement/evaluate.js";
export {
  MEASUREMENT_COLUMNS,
  importMeasurementCsv,
  serializeMeasurementCsv,
  summarizeEvidence,
} from "./measurement/import.js";
export type {
  EvidenceSummary,
  ImportResult,
  MeasurementRecord,
  NetworkType,
  Outcome,
  RejectedRow,
  RunByRole,
} from "./measurement/import.js";
export { parseCsv } from "./measurement/csv.js";
export { calculateSpend } from "./measurement/spend.js";
export type {
  PerRequestCost,
  PriceEntry,
  RequestAssumption,
  SpendCalculation,
  SpendCalculationInput,
} from "./measurement/spend.js";
export {
  BrokerError,
  enrolDevice,
  requestBrokerChat,
  streamBrokerChat,
  requestBrokerUsage,
  requestBrokerVision,
} from "./broker-client.js";
export type {
  BrokerChatMessage,
  BrokerChatRequest,
  BrokerClientOptions,
  BrokerReply,
  BrokerUsage,
  BrokerVisionRequest,
  EnrolledDevice,
} from "./broker-client.js";
export type { ClassifiedProviderError } from "./provider-gateway.js";
