# Acceptance Criteria

Criteria are written before implementation starts. Items without criteria here are NOT_STARTED-ready only after criteria are added.

## B16 — Offline command router

Implementation: `packages/core/src/offline-command-router.ts`, tests in `packages/core/src/offline-command-router.test.ts`.
Dependencies: none beyond `packages/core` (no network, phone, or protocol dependency).

| #   | Criterion                                                                                          | Test                                                       |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | A recognized phrase routes to exactly one local command                                            | "routes a recognized phrase…"                              |
| 2   | Wake-word prefix and punctuation/case differences do not change routing                            | "Hey LensMate, Time" case                                  |
| 3   | Unsupported input returns UNKNOWN and runs nothing                                                 | "returns UNKNOWN for an unsupported command…"              |
| 4   | Empty input returns UNKNOWN(EMPTY_INPUT)                                                           | "returns UNKNOWN for empty…"                               |
| 5   | Sensitive commands require explicit authorization and do not run without it                        | "does not run a sensitive command without authorization"   |
| 6   | Command runs with no network available (fetch throws if used)                                      | "runs a matched command offline when fetch is unavailable" |
| 7   | Concurrent duplicate of a non-concurrent command is refused                                        | "refuses a duplicate run…"                                 |
| 8   | Concurrent-safe commands may run in parallel and all complete                                      | "allows concurrent runs…"                                  |
| 9   | Cancel aborts the running handler and reports CANCELLED                                            | "cancel aborts a running command…"                         |
| 10  | Handler errors are reported as FAILED and the running slot is freed                                | "reports a handler error as FAILED…"                       |
| 11  | cancelAll and restart leave no stuck runs                                                          | "cancelAll stops every running command…"                   |
| 12  | Invalid command tables (duplicate ids, shared phrases, empty phrases) are rejected at construction | constructor tests                                          |

Not covered by this item (remain pending, see BLOCKERS.md): running on real glasses firmware, wake-word capture, and the real phone-disconnect path through the glasses link. The router takes no link input, so disconnect is covered by design, not by a hardware test.
