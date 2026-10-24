/**
 * Tracks the one AI request the screen is waiting for. Starting a new request cancels the previous one. Stop, leaving the
 * screen, and unmounting cancel the current one. A result is used only if its run is still the current run, so a late
 * answer from a cancelled or replaced request is never shown and never spoken.
 *
 * Cancelling only stops the phone from waiting. A request that already reached the broker may still complete, and the
 * broker's spending rules still apply to it (see docs/decisions/0004-assistant-cancellation.md).
 */
export class RunGuard {
  private id = 0;
  private controller: AbortController | null = null;

  /** Starts a run. Any earlier run is cancelled, and its result will be ignored. */
  begin(): { id: number; signal: AbortSignal } {
    this.controller?.abort();
    this.id += 1;
    const controller = new AbortController();
    this.controller = controller;
    return { id: this.id, signal: controller.signal };
  }

  /** True only while this run is the active one and has not been cancelled. */
  isCurrent(id: number): boolean {
    return id === this.id && this.controller !== null && !this.controller.signal.aborted;
  }

  /** Marks a run as finished normally. */
  finish(id: number): void {
    if (this.isCurrent(id)) {
      this.controller = null;
    }
  }

  /** Cancels the active run, if any. Returns true when there was one to cancel. */
  cancel(): boolean {
    if (this.controller === null) {
      return false;
    }
    this.controller.abort();
    this.controller = null;
    this.id += 1;
    return true;
  }
}
