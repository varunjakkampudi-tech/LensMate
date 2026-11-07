# Existing-Code Audit (CR-02)

Audit date: 2026-11-06, branch `dev`, base commit `7c0c2fd`.

Method: module-level mapping from tracked file names, the module's exported purpose, and whether a matching test file exists. Core and protocol test suites were run (13 suites, 96 tests passing before B16 was added). Other packages were not run in this audit and are mapped as IN_PROGRESS, not PASS.

Rule: a row is IN_PROGRESS when code exists but the requirement's acceptance criteria are not all shown. A row is IMPLEMENTED only when its own criteria pass.

## Packages

| Area                                       | Source                                                    | Maps to                      | Status                                    |
| ------------------------------------------ | --------------------------------------------------------- | ---------------------------- | ----------------------------------------- |
| Glasses gesture state machine              | packages/core/src/glasses-state.ts                        | (supports A14, N08)          | IN_PROGRESS                               |
| Capture indicator rule                     | packages/core/src/capture-indicator.ts + test             | A15, N05, D16                | IN_PROGRESS (software logic only; no LED) |
| Spend cap                                  | packages/core/src/spend-cap.ts + test                     | M15                          | IN_PROGRESS                               |
| Provider gateway (timeouts, error classes) | packages/core/src/provider-gateway.ts + test              | M01, I13                     | IN_PROGRESS                               |
| Mock provider                              | packages/core/src/mock-provider.ts                        | test support                 | n/a                                       |
| Broker client                              | packages/core/src/broker-client.ts + test                 | M01, B05                     | IN_PROGRESS                               |
| Log redaction                              | packages/core/src/log-redaction.ts + test                 | N12, M17                     | IN_PROGRESS                               |
| Retention sweep for temporary items        | packages/core/src/retention.ts + test                     | G21, D18                     | IN_PROGRESS                               |
| Glasses link interface                     | packages/core/src/glasses-link.ts                         | B01 interface only           | IN_PROGRESS                               |
| **Offline command router**                 | packages/core/src/offline-command-router.ts + test        | **B16**                      | **IMPLEMENTED (this change)**             |
| **Offline sync queue (B17)**               | packages/core/src/offline-sync-queue.ts + test            | **B17**                      | **IMPLEMENTED (this change)**             |
| Protocol codec and bundled schema          | packages/protocol/src/codec.ts, bundled-schema.ts + tests | B10 link messages (software) | IN_PROGRESS                               |

## Services

| Area               | Source                                                        | Maps to       | Status                                                        |
| ------------------ | ------------------------------------------------------------- | ------------- | ------------------------------------------------------------- |
| Server and routes  | services/broker/src/server.ts, routes/*                       | M01           | IN_PROGRESS                                                   |
| Provider adapter   | services/broker/src/provider.ts                               | M09, M10      | IN_PROGRESS (OpenRouter-related; live tests need credentials) |
| Pricing and budget | services/broker/src/pricing.ts, budget.ts, postgres-budget.ts | M15, M16      | IN_PROGRESS                                                   |
| Rate limits        | services/broker/src/limits.ts                                 | M14, N16      | IN_PROGRESS                                                   |
| Device enrolment   | services/broker/src/devices.ts                                | B05, B06      | IN_PROGRESS                                                   |
| Config and env     | services/broker/src/config.ts, env.ts                         | M19           | IN_PROGRESS                                                   |
| Backup             | services/broker/src/backup.ts                                 | L19 (partial) | IN_PROGRESS                                                   |
| Ledger anchor      | services/broker/src/ledger-anchor.ts                          | L19 (partial) | IN_PROGRESS                                                   |
| Safe log stream    | services/broker/src/safe-log-stream.ts                        | N12           | IN_PROGRESS                                                   |

## Mobile app (phone-first; not standalone glasses)

Every mobile-app item below runs on the phone, so it does not satisfy a standalone-glasses requirement (P15, B01 remain open).

| Area                            | Source                                                      | Maps to                 | Status      |
| ------------------------------- | ----------------------------------------------------------- | ----------------------- | ----------- |
| Camera capture                  | apps/mobile/src/capture/*                                   | C01, C03 (phone camera) | IN_PROGRESS |
| Speech recognition              | apps/mobile/src/ai/native-listen.ts, use-voice.ts           | E03 (phone)             | IN_PROGRESS |
| Speech output and barge-in stop | apps/mobile/src/ai/speech.ts, stop-latency.ts               | F01, F05 (phone)        | IN_PROGRESS |
| Assistant / agent / tool calls  | apps/mobile/src/ai/assistant.ts, agent.ts, tool-calls.ts    | K06, I10 (partial)      | IN_PROGRESS |
| Memory vault and search         | apps/mobile/src/memory/vault.ts, search.ts, native-store.ts | G01, G08, N03           | IN_PROGRESS |
| Memory backup and export        | apps/mobile/src/memory/backup.ts                            | P11, G20                | IN_PROGRESS |
| Diagnostics                     | apps/mobile/src/diagnostics/checks.ts, battery.ts           | B23 (partial)           | IN_PROGRESS |
| Device credential and enrolment | apps/mobile/src/device-credential.ts, enrolment-screen.tsx  | B05, B06                | IN_PROGRESS |
| Virtual glasses link            | apps/mobile/src/virtual-glasses-link.ts                     | B10 (virtual only)      | IN_PROGRESS |
| Mobile app platforms            | apps/mobile (Expo, web/PWA)                                 | P01, P02 (partial)      | IN_PROGRESS |

## Firmware and simulation

| Area                    | Source                                 | Maps to                                                   | Status      |
| ----------------------- | -------------------------------------- | --------------------------------------------------------- | ----------- |
| Wokwi simulation sketch | firmware/simulation/wokwi/sketch.ino   | none (simulation only; never counts as hardware evidence) | NOT counted |
| Simulator tool          | tools/simulator/src/virtual-glasses.ts | none (virtual only)                                       | NOT counted |

## Not present in the repository (checked by search)

- On-glasses OS, firmware runtime, SoC drivers, camera/mic/speaker drivers (A05–A11, B10–B14 on-device).
- OTA update signing and rollback (B07–B09).
- Continuous video buffer and clip saving (D04, D13–D14).
- Standalone sleep/wake states (B18).
- Offline command routing before B16 (B16 was missing; implemented in this change).
