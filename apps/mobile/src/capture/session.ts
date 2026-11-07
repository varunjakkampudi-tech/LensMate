/**
 * One capture and ask session: a photo, questions about it, answers shown and spoken, with interruption,
 * cancellation and camera cleanup. The capture screen (app/capture.tsx) is a view over this state machine.
 *
 * Camera, network and speech are injected (CaptureDeps), so the same logic runs in the app and in automated tests. Tests
 * stand in for the camera and speech engines and say so; they do not exercise a physical camera or speaker.
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

export interface CaptureAnswer {
  readonly text: string;
  readonly source: "mock" | "openrouter";
  readonly costPaise: number;
  readonly latencyMs: number;
}

export type CapturePhase =
  | "idle" // nothing on screen
  | "previewing" // the camera is live
  | "photo_ready" // a photo is held, no request running
  | "thinking" // a question is being answered
  | "answered" // an answer is shown
  | "speaking" // an answer is being read aloud
  | "error"; // the last action failed; the photo and any answer are kept

export interface CaptureState {
  readonly phase: CapturePhase;
  /** The photo held for questions, as a JPEG or PNG data URL. */
  readonly photo: string | null;
  readonly answer: CaptureAnswer | null;
  /** A short, user-facing message for the error phase or a camera notice. */
  readonly message: string | null;
}

/** Injected dependencies. Each is a real app function in production and a stand-in in tests. */
export interface CaptureDeps {
  /** Called when the camera is started (the screen starts its capture indicator here). */
  startCamera(): void;
  /** Takes one photo from the live preview. Resolves to a data URL, or null when the camera is not ready. */
  capture(): Promise<string | null>;
  /** Stops the camera and clears its indicator. Called once per start. */
  releaseCamera(): void;
  ask(image: string, question: string, signal: AbortSignal): Promise<CaptureAnswer>;
  speak(text: string, onDone: () => void): void;
  stopSpeech(): void;
  errorText(error: unknown): string;
}

const INITIAL: CaptureState = { phase: "idle", photo: null, answer: null, message: null };

export class CaptureSession {
  private current: CaptureState = INITIAL;
  private abort: AbortController | null = null;
  private camera = false;
  private readonly listeners = new Set<(state: CaptureState) => void>();

  constructor(private readonly deps: CaptureDeps) {}

  get state(): CaptureState {
    return this.current;
  }

  subscribe(listener: (state: CaptureState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private set(patch: Partial<CaptureState> & { phase: CapturePhase }): void {
    this.current = {
      photo: this.current.photo,
      answer: this.current.answer,
      message: null,
      ...patch,
    };
    this.listeners.forEach((fn) => fn(this.current));
  }

  /** Where the session rests when nothing is running: answered, a photo held, or idle. */
  private restPhase(): CapturePhase {
    if (this.current.answer !== null) {
      return "answered";
    }
    return this.current.photo !== null ? "photo_ready" : "idle";
  }

  /** Starts the camera. The preview asks for permission and reports a refusal through reportCameraError. */
  start(): void {
    if (this.camera) {
      return;
    }
    this.camera = true;
    this.deps.startCamera();
    this.set({ phase: "previewing" });
  }

  /** Stops the camera once. Safe to call when it is not running. */
  private stopCamera(): void {
    if (this.camera) {
      this.camera = false;
      this.deps.releaseCamera();
    }
  }

  /** Takes one photo from the live preview, validates it, and ends the live preview. */
  async takePhoto(): Promise<void> {
    if (this.current.phase !== "previewing") {
      return;
    }
    let dataUrl: string | null;
    try {
      dataUrl = await this.deps.capture();
    } catch (error) {
      this.reportCameraError(this.deps.errorText(error));
      return;
    }
    if (dataUrl === null) {
      this.reportCameraError("The camera was not ready. Try again.");
      return;
    }
    this.stopCamera();
    this.setPhoto(dataUrl);
  }

  /** Accepts a photo from the library or the camera after validating it. A bad image keeps the current photo. */
  setPhoto(dataUrl: string | null): boolean {
    const check = checkImage(dataUrl);
    if (!check.ok) {
      this.set({
        phase: this.restPhase(),
        message:
          check.reason === "TOO_LARGE"
            ? "That photo is too large. Try again closer to the object."
            : "That file could not be read as an image.",
      });
      return false;
    }
    this.set({ phase: "photo_ready", photo: dataUrl as string, answer: null });
    return true;
  }

  /** Removes the photo and its answer, and stops any speech. */
  removePhoto(): void {
    this.deps.stopSpeech();
    this.set({ phase: "idle", photo: null, answer: null });
  }

  /** Asks one question about the held photo. A newer question replaces an older one still in progress. */
  async ask(question: string): Promise<void> {
    const photo = this.current.photo;
    if (photo === null || question.trim() === "" || this.current.phase === "thinking") {
      return;
    }
    this.deps.stopSpeech();
    const controller = new AbortController();
    this.abort = controller;
    this.set({ phase: "thinking", photo, answer: this.current.answer });
    try {
      const answer = await this.deps.ask(photo, question.trim(), controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      this.set({ phase: "answered", photo, answer });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      this.set({
        phase: "error",
        photo,
        answer: this.current.answer,
        message: this.deps.errorText(error),
      });
    } finally {
      if (this.abort === controller) {
        this.abort = null;
      }
    }
  }

  /** Reads the shown answer aloud. Ends by itself, or when interrupted. */
  speak(): void {
    const { phase, answer, photo } = this.current;
    if (answer === null || (phase !== "answered" && phase !== "error")) {
      return;
    }
    this.set({ phase: "speaking", photo, answer });
    this.deps.speak(answer.text, () => {
      if (this.current.phase === "speaking") {
        this.set({ phase: "answered", photo, answer });
      }
    });
  }

  /** Stops speech at once. The answer stays on screen. */
  interrupt(): void {
    this.deps.stopSpeech();
    if (this.current.phase === "speaking") {
      this.set({ phase: "answered", photo: this.current.photo, answer: this.current.answer });
    }
  }

  /** Cancels a question in progress. Its answer is discarded; the previous answer, if any, is shown again. */
  cancelRequest(): void {
    if (this.current.phase !== "thinking") {
      return;
    }
    this.abort?.abort();
    this.abort = null;
    this.set({ phase: this.restPhase() });
  }

  /** Cancels the live preview without taking a photo. */
  cancelCamera(): void {
    this.stopCamera();
    this.set({ phase: this.restPhase() });
  }

  /** The camera failed or was refused. The message says what to do; any photo and answer are kept. */
  reportCameraError(message: string): void {
    this.stopCamera();
    this.set({ phase: this.restPhase(), message });
  }

  /** Leaves the screen: stops speech and any request, and releases the camera. Keeps the photo and answer. */
  end(): void {
    this.abort?.abort();
    this.abort = null;
    this.deps.stopSpeech();
    this.stopCamera();
    this.set({ phase: this.restPhase() });
  }
}
