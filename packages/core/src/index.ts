/**
 * Pure domain logic for the smart glasses software track.
 * No React and no native imports.
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
  captureSessionForEffect,
  isCapturing,
  onGesture,
  speechEnded,
  speechStarted,
} from "./glasses-state.js";
export type {
  Gesture,
  GlassesEffect,
  GlassesMode,
  GlassesState,
  GlassesTransition,
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
export { OfflineCommandRouter, normalizeUtterance } from "./offline-command-router.js";
export type {
  CommandHandler,
  CommandSensitivity,
  ExecutionResult,
  LocalCommand,
  AuthorizationPolicy,
  CommandSource,
  RouterOptions,
  RouteDecision,
} from "./offline-command-router.js";
export { OfflineSyncQueue, QueueError } from "./offline-sync-queue.js";
export type {
  CancelResult,
  DeleteResult,
  DeliveredEntry,
  DrainSummary,
  EnqueueInput,
  EnqueueResult,
  EntryState,
  PayloadCipher,
  QueueErrorCode,
  QueueLimits,
  QueueOptions,
  QueueStorage,
  RetryPolicy,
  SendResult,
  Sender,
  StoredRecord,
} from "./offline-sync-queue.js";

export { NetworkRecovery } from "./network-recovery.js";
export type {
  NetworkRecoveryOptions,
  RecoverySnapshot,
  RecoveryState,
  ReconnectPolicy,
  Scheduler,
} from "./network-recovery.js";

export { LocalClock, ClockError } from "./local-clock.js";
export type {
  ClockSource,
  ClockReading,
  ClockState,
  LocalClockOptions,
  Provenance,
  SyncResult,
  TrustedSync,
} from "./local-clock.js";

export { DeviceLock, LockError } from "./device-lock.js";
export type {
  AuditEntry,
  DeviceLockOptions,
  LockAction,
  LockCommand,
  LockResult,
  LockState,
  LockStatus,
  RefusalReason,
} from "./device-lock.js";

export { FactoryReset, ResetError, RESET_STEPS } from "./factory-reset.js";
export type {
  ResetAuditEntry,
  ResetState,
  ResetStatus,
  ResetStep,
  ResetStore,
  StepOutcome,
  StepRunner,
} from "./factory-reset.js";

export { DiagnosticsRecovery } from "./diagnostics-recovery.js";
export type {
  CrashCategory,
  CrashKind,
  CrashResult,
  DiagnosticsOptions,
  DiagnosticsState,
  Mode,
  SafeModeReason,
} from "./diagnostics-recovery.js";

export { Pairing, PairingError } from "./pairing.js";
export type {
  Capability,
  PairingAuditEntry,
  PairingOptions,
  PairingResult,
  PairingState,
  PeerKind,
  PeerRecord,
} from "./pairing.js";

export { AccountBinding, AccountError } from "./account-binding.js";
export type {
  AccountAction,
  AccountAuditEntry,
  AccountOptions,
  AccountResult,
  AccountState,
  Binding,
  Status,
} from "./account-binding.js";
export { CameraCapture, CameraCaptureError } from "./camera-capture.js";
export type {
  CameraAdapter,
  CameraCaptureOptions,
  CaptureRefusal,
  CaptureResult,
  PlatformCheck,
} from "./camera-capture.js";
export { FrameAnalysisSession, FrameAnalysisError } from "./frame-analysis.js";
export type {
  FrameAnalysisOptions,
  FrameAnalysisRefusal,
  FrameAnalysisResult,
  FrameProvider,
  FrameProviderResult,
  FramePlatformCheck,
} from "./frame-analysis.js";
export { VoiceQuestion, VoiceQuestionError } from "./voice-question.js";
export type {
  QuestionAnalysis,
  QuestionCamera,
  QuestionRefusal,
  QuestionResult,
  VoiceQuestionOptions,
} from "./voice-question.js";
export { ObjectRecognizer, ObjectRecognizerError, parseRecognition } from "./object-recognition.js";
export type {
  Certainty,
  RecognitionAnalysis,
  RecognitionItem,
  RecognitionKind,
  RecognitionRefusal,
  RecognitionResult,
  RecognitionState,
} from "./object-recognition.js";
export {
  SceneDescriber,
  SceneDescriberError,
  parseRelations,
  RELATION_KINDS,
} from "./scene-layout.js";
export type {
  RelationKind,
  SceneAnalysis,
  SceneDescriberOptions,
  SceneRefusal,
  SceneRelation,
  SceneResult,
  SceneState,
} from "./scene-layout.js";
export { TextReader, TextReaderError, parseReading, DOCUMENT_CATEGORIES } from "./visual-text.js";
export type {
  Basis,
  DocumentCategory,
  ReadingState,
  ReadResult,
  TextAnalysis,
  TextReaderOptions,
  TextRefusal,
  TextRegion,
} from "./visual-text.js";
