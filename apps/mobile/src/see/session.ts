/**
 * One SEE → THINK → TALK session: photo in, question asked, answer shown and spoken, with interruption and cancellation.
 *
 * The session is a small state machine. Its camera, network and speech parts are passed in (SeeDeps), so the same logic
 * runs in the app and in automated tests. Tests stand in for the camera and speech engines; they do not exercise a
 * physical camera or speaker, and the tests say so.
 */

/** Largest decoded image the broker accepts (services/broker/src/config.ts, maxImageBytes). */
export const MAX_IMAGE_BYTES = 1_048_576;
const IMAGE_DATA_URL = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/;

export type ImageCheck =
  | { readonly ok: true; readonly bytes: number }
  | { readonly ok: false; readonly reason: "NOT_AN_IMAGE" | "TOO_LARGE" | "EMPTY" };

/** Checks a data URL against the broker's rules before anything leaves the phone. */
export function checkImage(dataUrl: string | null): ImageCheck {
  if (dataUrl === null || dataUrl === "") {
    return { ok: false, reason: "EMPTY" };
  }
  const match = IMAGE_DATA_URL.exec(dataUrl);
  if (match === null) {
    return { ok: false, reason: "NOT_AN_IMAGE" };
  }
  const base64 = match[2] ?? "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((base64.length * 3) / 4) - padding;
  if (bytes <= 0) {
    return { ok: false, reason: "EMPTY" };
  }
  if (bytes > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "TOO_LARGE" };
  }
  return { ok: true, bytes };
}

export type SeeState =
  | { readonly phase: "idle" }
  | { readonly phase: "permission_denied" }
  | { readonly phase: "previewing" }
  | { readonly phase: "photo_ready"; readonly image: string }
  | { readonly phase: "thinking" }
  | { readonly phase: "answered"; readonly answer: string; readonly source: "mock" | "openrouter" }
  | { readonly phase: "speaking"; readonly answer: string; readonly source: "mock" | "openrouter" }
  | { readonly phase: "error"; readonly message: string };

/** Injected dependencies. Each one is a real app function in production and a stand-in in tests. */
export interface SeeDeps {
  requestCamera(): Promise<boolean>;
  capture(): Promise<string | null>;
  releaseCamera(): void;
  ask(
    image: string,
    question: string,
    signal: AbortSignal,
  ): Promise<{ text: string; source: "mock" | "openrouter" }>;
  speak(text: string, onDone: () => void): void;
  stopSpeech(): void;
  errorText(error: unknown): string;
}

export class SeeSession {
  private current: SeeState = { phase: "idle" };
  private abort: AbortController | null = null;
  private readonly listeners = new Set<(state: SeeState) => void>();

  constructor(private readonly deps: SeeDeps) {}

  get state(): SeeState {
    return this.current;
  }

  subscribe(listener: (state: SeeState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(state: SeeState): void {
    this.current = state;
    this.listeners.forEach((fn) => fn(state));
  }

  /** Step 1-2: asks for the camera and starts the preview. A refusal leads to a recoverable state. */
  async start(): Promise<void> {
    if (!(await this.deps.requestCamera())) {
      this.set({ phase: "permission_denied" });
      return;
    }
    this.set({ phase: "previewing" });
  }

  /** Step 3-4: takes one photo, validates it, and keeps it for the question. Only one photo per question. */
  async takePhoto(): Promise<void> {
    if (this.current.phase !== "previewing") {
      return;
    }
    let dataUrl: string | null;
    try {
      dataUrl = await this.deps.capture();
    } catch (error) {
      this.set({ phase: "error", message: this.deps.errorText(error) });
      return;
    }
    const check = checkImage(dataUrl);
    if (!check.ok) {
      this.set({
        phase: "error",
        message:
          check.reason === "TOO_LARGE"
            ? "That photo is too large. Try again closer to the object."
            : "That photo could not be read. Take it again.",
      });
      return;
    }
    this.set({ phase: "photo_ready", image: dataUrl as string });
  }

  /** Step 5-7: asks the question about the photo through the broker and shows the labelled answer. */
  async ask(question: string): Promise<void> {
    if (this.current.phase !== "photo_ready" || question.trim() === "") {
      return;
    }
    const image = this.current.image;
    this.abort = new AbortController();
    this.set({ phase: "thinking" });
    try {
      const reply = await this.deps.ask(image, question.trim(), this.abort.signal);
      if (this.abort.signal.aborted) {
        return;
      }
      this.set({ phase: "answered", answer: reply.text, source: reply.source });
    } catch (error) {
      if (this.abort.signal.aborted) {
        return;
      }
      this.set({ phase: "error", message: this.deps.errorText(error) });
    } finally {
      this.abort = null;
    }
  }

  /** Step 8: speaks the answer. Speech ends by itself or when interrupted. */
  speak(): void {
    if (this.current.phase !== "answered") {
      return;
    }
    const { answer, source } = this.current;
    this.set({ phase: "speaking", answer, source });
    this.deps.speak(answer, () => {
      if (this.current.phase === "speaking") {
        this.set({ phase: "answered", answer, source });
      }
    });
  }

  /** Step 9: stops speech at once. The answer stays on screen. */
  interrupt(): void {
    this.deps.stopSpeech();
    if (this.current.phase === "speaking") {
      this.set({ phase: "answered", answer: this.current.answer, source: this.current.source });
    }
  }

  /** Cancels a request in progress; the answer is discarded. Speech stops too. */
  cancel(): void {
    this.abort?.abort();
    this.deps.stopSpeech();
    this.set({ phase: "previewing" });
  }

  /** Step 10: releases the camera and speech, and returns to idle. Safe to call more than once. */
  end(): void {
    this.abort?.abort();
    this.deps.stopSpeech();
    this.deps.releaseCamera();
    this.set({ phase: "idle" });
  }
}
