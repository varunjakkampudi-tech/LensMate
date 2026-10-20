import type { EnvelopeMessage } from "@lensmate/protocol";

/**
 * The only way the app talks to glasses (Goal 10A.1; decision G46).
 * Implementations: the virtual glasses simulator, the real Bluetooth link, and a test fake.
 */
export type LinkStatus = "disconnected" | "connected";

export type EnvelopeHandler = (message: EnvelopeMessage) => void;

export interface GlassesLink {
  readonly status: LinkStatus;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Sends one envelope. Rejects when the link is not connected. */
  send(message: EnvelopeMessage): Promise<void>;
  /** Registers a handler for envelopes from the glasses. Returns the function that removes it. */
  subscribe(handler: EnvelopeHandler): () => void;
}
