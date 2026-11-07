# Acceptance Criteria

Criteria are written before implementation starts. Items without criteria here are NOT_STARTED-ready only after criteria are added.

## B16 — Offline command router

Implementation: `packages/core/src/offline-command-router.ts`, tests in `packages/core/src/offline-command-router.test.ts`.
Dependencies: none beyond `packages/core` (no network, phone, or protocol dependency).

| #   | Criterion                                                                                                                                                                                                                   | Test                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | A recognized phrase routes to exactly one local command                                                                                                                                                                     | "routes a recognized phrase…"                                                           |
| 2   | Wake-word prefix and punctuation/case differences do not change routing                                                                                                                                                     | "Hey LensMate, Time" case                                                               |
| 3   | Unsupported input returns UNKNOWN and runs nothing                                                                                                                                                                          | "returns UNKNOWN for an unsupported command…"                                           |
| 4   | Empty input returns UNKNOWN(EMPTY_INPUT)                                                                                                                                                                                    | "returns UNKNOWN for empty…"                                                            |
| 5   | Sensitive commands require explicit authorization and do not run without it                                                                                                                                                 | "does not run a sensitive command without authorization"                                |
| 6   | Command runs with no network available (fetch throws if used)                                                                                                                                                               | "runs a matched command offline when fetch is unavailable"                              |
| 7   | Concurrent duplicate of a non-concurrent command is refused                                                                                                                                                                 | "refuses a duplicate run…"                                                              |
| 8   | Concurrent-safe commands may run in parallel and all complete                                                                                                                                                               | "allows concurrent runs…"                                                               |
| 9   | Cancel aborts the running handler and reports CANCELLED                                                                                                                                                                     | "cancel aborts a running command…"                                                      |
| 10  | Handler errors are reported as FAILED and the running slot is freed                                                                                                                                                         | "reports a handler error as FAILED…"                                                    |
| 11  | cancelAll and restart leave no stuck runs                                                                                                                                                                                   | "cancelAll stops every running command…"                                                |
| 12  | Invalid command tables (duplicate ids, shared phrases, empty phrases) are rejected at construction                                                                                                                          | constructor tests                                                                       |
| 13  | (CR-06) A cancelled non-concurrent command keeps its slot until its handler actually settles, even if the handler ignores the abort                                                                                         | "keeps a non-concurrent command occupied…"                                              |
| 14  | (CR-06) A restart issued right after cancel is refused while the old handler still runs                                                                                                                                     | "cancel-and-restart race…"                                                              |
| 15  | (CR-06) cancelAll with an ignored abort does not free the slot early                                                                                                                                                        | "cancelAll with an ignored abort…"                                                      |
| 16  | (CR-06) A delayed handler that finishes after the abort reports CANCELLED and then frees its slot                                                                                                                           | "delayed cancellation…"                                                                 |
| 17  | (CR-06) A failed handler frees its slot so the next run is allowed                                                                                                                                                          | "cleans up after a failure…"                                                            |
| 18  | (CR-06) A stuck handler on one command does not block a different command                                                                                                                                                   | "a stubborn handler on one command…"                                                    |
| 19  | (security, CR-security) Sensitive authorization is decided by a trusted policy supplied at construction, with default deny. The caller cannot grant it by passing a flag, and the policy receives the command id and source | "asks the trusted policy with the command id…"; "denies sensitive commands by default…" |

Not covered by this item (remain pending, see BLOCKERS.md): running on real glasses firmware, wake-word capture, and the real phone-disconnect path through the glasses link. The router takes no link input, so disconnect is covered by design, not by a hardware test.

## B17 — Local queue and deferred synchronization

Audit (before this item): no durable offline queue exists in `packages/core`. Existing pieces that are reused or referenced:

- `packages/core/src/retention.ts` — temporary-item expiry (24 h) and sweep; reused for the expiry rule.
- `packages/core/src/provider-gateway.ts` — retryable/non-retryable classification; the queue uses its own bounded backoff (same idea, separate concern).
- `apps/mobile/src/memory/native-store.ts` — phone-side encrypted SQLite store; not used by `packages/core` (core has no native imports). Its wiring to the queue is a later integration item.
- `apps/mobile/src/memory/backup.ts` — AES-GCM encryption on the phone; the queue takes an injected cipher with the same shape instead of importing it.

Implementation: `packages/core/src/offline-sync-queue.ts`, tests in `packages/core/src/offline-sync-queue.test.ts`. No network, phone, or cloud import. Time is injected (`nowMs`), so tests are deterministic.

Design summary: the queue persists a whole snapshot through an injected `QueueStorage` (atomic save), serializes operations, and keeps memory unchanged when a save fails.

| #   | Criterion                                                                                                                                                  | Test                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Enqueued entries survive a restart: reopening from the same storage restores pending entries in order                                                      | "restores pending entries after restart"                                             |
| 2   | A repeated idempotency key does not create a second entry                                                                                                  | "duplicate idempotency key"                                                          |
| 3   | Entry-count, character-quota and payload-size limits are enforced and rejected with a reason                                                               | "quota and payload limits"                                                           |
| 4   | Sensitive entries require a cipher (fail closed); stored ciphertext contains no plaintext; ciphertext is bound to the entry id and owner (tampering fails) | "sensitive entries need a cipher", "tampered ciphertext"                             |
| 5   | Delivery is in sequence order; delivered entries are never delivered again within the dedupe window                                                        | "delivers in order and not twice"                                                    |
| 6   | Retryable failures back off exponentially with a cap and stop after the attempt limit (then DEAD)                                                          | "bounded exponential backoff"                                                        |
| 7   | Permanent failures and thrown errors are handled: permanent → DEAD at once; thrown → retryable                                                             | "permanent failure", "thrown error is retryable"                                     |
| 8   | Interrupted sync: IN_FLIGHT entries found after restart return to PENDING and are resent with the same idempotency key                                     | "interrupted sync is resent with the same key"                                       |
| 9   | Cancellation during drain stops work, returns the entry to PENDING, and does not count an attempt                                                          | "cancel during drain"                                                                |
| 10  | Cancelling a pending entry erases its payload; cancelling an in-flight entry is refused                                                                    | "cancel pending erases payload", "cancel in-flight refused"                          |
| 11  | Permanent deletion removes the record from storage                                                                                                         | "permanent deletion"                                                                 |
| 12  | Sweep removes expired entries and delivered entries past the dedupe window                                                                                 | "sweep"                                                                              |
| 13  | Corrupt snapshot or a record for another owner fails closed on open, and storage is not overwritten                                                        | "corrupt snapshot fails closed", "foreign owner record"                              |
| 14  | A failed save leaves the in-memory queue unchanged (no phantom entry)                                                                                      | "failed save leaves queue unchanged"                                                 |
| 15  | Concurrent enqueues are serialized: unique, ordered sequence numbers and no lost entries                                                                   | "concurrent enqueues"                                                                |
| 16  | CR-10: a record id cannot be stored twice; a conflicting id is rejected without changing storage, and the snapshot still reopens                           | "CR-10: rejects a second record with an existing id"                                 |
| 17  | CR-11: an idempotency key stays unique for as long as its record is stored (including canceled); after removal it can be reused; reopening always succeeds | "CR-11: a canceled key is not reusable", "CR-11: after a canceled record is removed" |
| 18  | CR-12: cancellation that arrives during a delayed decrypt stops the drain before any sender call; the entry returns to PENDING with no attempt counted     | "CR-12: cancellation during a delayed decrypt"                                       |

Not covered by this item: real device storage (SQLite/keystore on the phone or on-glasses flash), the production cipher implementation for each platform, real network sync to the broker, and any power-loss test on hardware (BLK-001). Those remain pending. Software tests use an in-memory storage with failure injection and a real AES-256-GCM cipher from Node's crypto module in tests only.

## B19 — Network loss recovery and automatic reconnection

Audit (before this item): `packages/core/src/glasses-link.ts` defines connect/disconnect but no reconnection. `packages/core/src/broker-client.ts` maps failures to retryable codes but has no network-state tracking or reconnect loop. No existing module reports network state or schedules recovery. The new module is `packages/core/src/network-recovery.ts`. It is pure: the platform reports network state, and timers and randomness are injected, so tests are deterministic.

| #   | Criterion                                                                                                          | Test                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| 1   | Repeated network reports with the same value are ignored; a change is applied once                                 | "ignores repeated network reports"                          |
| 2   | Going online starts a stability window; if the network drops inside the window, no attempt is made (flap debounce) | "flap inside stability window makes no attempt"             |
| 3   | While offline, no connect attempt is ever made                                                                     | "no attempt while offline"                                  |
| 4   | Failed attempts back off exponentially, capped at maxDelayMs; jitter adds at most jitterRatio of the delay         | "exponential backoff with cap and bounded jitter"           |
| 5   | A successful connect resets the failure count; the next outage starts again at the base delay                      | "success resets backoff"                                    |
| 6   | Network returning (after the stability window) triggers an immediate attempt and cancels any pending backoff timer | "return online retries immediately"                         |
| 7   | Going offline during an attempt aborts it; the aborted attempt is not counted as a failure                         | "offline aborts in-flight attempt without counting failure" |
| 8   | Attempts never overlap: only one connect is in flight at a time                                                    | "attempts never overlap"                                    |
| 9   | Each successful (re)connect calls onConnected exactly once, which is the synchronization trigger                   | "onConnected once per successful connect"                   |
| 10  | With maxAttempts set, the controller gives up (GAVE_UP) and schedules nothing until retryNow() is called           | "gives up after maxAttempts; retryNow resumes"              |
| 11  | stop() cancels timers, aborts the in-flight attempt, ignores late results, and no attempt starts afterwards        | "stop cancels timers and late results"                      |

Not covered by this item: real Wi-Fi or cellular hardware behaviour, OS network-change events on the phone or glasses, and any broker integration. The platform adapter that feeds reportNetwork is a later integration step. Those remain pending (BLK-001 for on-device work).
