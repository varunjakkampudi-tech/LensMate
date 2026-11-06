/**
 * Offline command router (checklist B16).
 *
 * Maps a recognized utterance to a locally defined command. It has no network,
 * phone, or cloud dependency: it only reads its own command table, so it keeps
 * working when the internet or the phone is unavailable.
 *
 * Sensitive commands never run without explicit authorization from the caller.
 */

export type CommandSensitivity = "SAFE" | "SENSITIVE";

export interface LocalCommand {
  /** Stable identifier, for example "CLOCK" or "LOCK_DEVICE". */
  readonly id: string;
  /** Normalized phrases that trigger the command. */
  readonly phrases: readonly string[];
  readonly sensitivity: CommandSensitivity;
  /**
   * When false, a second run of the same command is refused while the first is still in flight.
   * Defaults to false (no concurrent duplicate runs).
   */
  readonly allowConcurrent?: boolean;
}

export interface RouteContext {
  /** True only when the owner has explicitly authorized this specific sensitive command. */
  readonly authorized: boolean;
}

export type RouteDecision =
  | { readonly kind: "EXECUTE"; readonly commandId: string }
  | { readonly kind: "UNKNOWN"; readonly reason: "NO_MATCH" | "EMPTY_INPUT" }
  | { readonly kind: "NEEDS_AUTHORIZATION"; readonly commandId: string };

export type ExecutionResult =
  | { readonly status: "COMPLETED"; readonly commandId: string }
  | { readonly status: "FAILED"; readonly commandId: string; readonly reason: "HANDLER_ERROR" }
  | { readonly status: "CANCELLED"; readonly commandId: string }
  | { readonly status: "SKIPPED_DUPLICATE"; readonly commandId: string }
  | { readonly status: "UNKNOWN"; readonly reason: "NO_MATCH" | "EMPTY_INPUT" }
  | { readonly status: "NEEDS_AUTHORIZATION"; readonly commandId: string };

export type CommandHandler = (signal: AbortSignal) => Promise<void>;

const WAKE_PREFIXES = ["hey lensmate", "lensmate"] as const;

/** Lowercases, removes punctuation, collapses whitespace, and strips a leading wake word. */
export function normalizeUtterance(input: string): string {
  let text = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const prefix of WAKE_PREFIXES) {
    if (text === prefix) {
      return "";
    }
    if (text.startsWith(`${prefix} `)) {
      text = text.slice(prefix.length + 1).trim();
      break;
    }
  }
  return text;
}

export class OfflineCommandRouter {
  private readonly byPhrase = new Map<string, LocalCommand>();
  private readonly byId = new Map<string, LocalCommand>();
  private readonly inFlight = new Map<string, Set<AbortController>>();

  constructor(commands: readonly LocalCommand[]) {
    for (const command of commands) {
      if (this.byId.has(command.id)) {
        throw new Error(`duplicate command id: ${command.id}`);
      }
      this.byId.set(command.id, command);
      for (const phrase of command.phrases) {
        const key = normalizeUtterance(phrase);
        if (key === "") {
          throw new Error(`empty phrase for command: ${command.id}`);
        }
        if (this.byPhrase.has(key)) {
          throw new Error(`phrase "${key}" is claimed by more than one command`);
        }
        this.byPhrase.set(key, command);
      }
    }
  }

  /** Pure routing decision. Does not execute anything. */
  route(utterance: string, context: RouteContext): RouteDecision {
    const key = normalizeUtterance(utterance);
    if (key === "") {
      return { kind: "UNKNOWN", reason: "EMPTY_INPUT" };
    }
    const command = this.byPhrase.get(key);
    if (!command) {
      return { kind: "UNKNOWN", reason: "NO_MATCH" };
    }
    if (command.sensitivity === "SENSITIVE" && !context.authorized) {
      return { kind: "NEEDS_AUTHORIZATION", commandId: command.id };
    }
    return { kind: "EXECUTE", commandId: command.id };
  }

  /**
   * Routes and runs a command. Handlers receive an AbortSignal that `cancel` triggers.
   * Handler errors are reported as FAILED and never escape to the caller.
   */
  async execute(
    utterance: string,
    context: RouteContext,
    handlers: Readonly<Record<string, CommandHandler>>,
  ): Promise<ExecutionResult> {
    const decision = this.route(utterance, context);
    if (decision.kind === "UNKNOWN") {
      return { status: "UNKNOWN", reason: decision.reason };
    }
    if (decision.kind === "NEEDS_AUTHORIZATION") {
      return { status: "NEEDS_AUTHORIZATION", commandId: decision.commandId };
    }

    const command = this.byId.get(decision.commandId);
    const handler = handlers[decision.commandId];
    if (!command || !handler) {
      return { status: "UNKNOWN", reason: "NO_MATCH" };
    }

    const running = this.inFlight.get(command.id) ?? new Set<AbortController>();
    if (running.size > 0 && command.allowConcurrent !== true) {
      return { status: "SKIPPED_DUPLICATE", commandId: command.id };
    }

    const controller = new AbortController();
    running.add(controller);
    this.inFlight.set(command.id, running);
    try {
      await handler(controller.signal);
      if (controller.signal.aborted) {
        return { status: "CANCELLED", commandId: command.id };
      }
      return { status: "COMPLETED", commandId: command.id };
    } catch {
      if (controller.signal.aborted) {
        return { status: "CANCELLED", commandId: command.id };
      }
      return { status: "FAILED", commandId: command.id, reason: "HANDLER_ERROR" };
    } finally {
      running.delete(controller);
      if (running.size === 0) {
        this.inFlight.delete(command.id);
      }
    }
  }

  /** Aborts all running runs of a command. Returns false when none are running. */
  cancel(commandId: string): boolean {
    const running = this.inFlight.get(commandId);
    if (!running || running.size === 0) {
      return false;
    }
    for (const controller of running) {
      controller.abort();
    }
    this.inFlight.delete(commandId);
    return true;
  }

  /** Aborts every running command, for example on shutdown, cutoff, or restart. */
  cancelAll(): void {
    for (const running of this.inFlight.values()) {
      for (const controller of running) {
        controller.abort();
      }
    }
    this.inFlight.clear();
  }

  /** Number of command runs currently in progress. */
  get runningCount(): number {
    let count = 0;
    for (const running of this.inFlight.values()) {
      count += running.size;
    }
    return count;
  }
}
