# PROGRESS

## Checkpoint 3 (after the Stage B and C slice)

Added: gesture precedence (Stage B), Locked-feature absence test (Stage B), log redaction allowlist and temporary retention (Stage B, partial), provider gateway with mocks and disclosure gate (Stage C, partial), and a scheduled dependency audit that is blocked on the owner waiver decision (BLOCKER-010). Local gates pass: typecheck, lint, format, knip, 102 root tests, 4 mobile tests.

Still open: the Stage C broker (needs owner hosting and keys), Stages D to G (voice, vision, translation, memory), the Stage H switch framework, Stage I harness, Stage J firmware, Stage K report, Maestro flows, and saved-item deletion and export.

## Summary at this stop

Completed and verified on main: monorepo, strict typing, lint, format, knip, Jest gates, secret scan, protocol schema v1 with drift check, GlassesLink, capture indicator rule, virtual glasses simulator, Expo app skeleton (development-build config, not built), spend cap decision logic, and the matrices. Last CI run on main: 39334527081 (success).

Stage B (gesture precedence, listening sessions, Locked-feature absence) is integrated in 927ab18. Stopped here, not blocked: the rest of Stage B (retention and log hygiene), Stage C gateway with mocks, the dependency audit gate, and the Maestro flows are unblocked and are the next steps. They are large, so they are not started in this session. Blocked on owner: BLOCKER-001, 002, 004, 006, 007, 009. Due: BLOCKER-003 after 2026-10-20 14:40 UTC.

Owner approval: OWNER-APPROVAL-001 in `blocker.txt` (RESOLVED, 2026-10-20, on main). The smart glasses goal is ACTIVE. Direct commits to `main` are allowed under the four conditions in that entry.

Status is reported per item with its evidence level. Nothing is marked complete without evidence. No real-phone, hardware, or provider result exists yet.

## Current checkpoint (commits since approval: 6)

| Commit (on main) | Scope                                                                                    | CI run                                                     |
| ---------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 649854c          | Monorepo skeleton, strict TypeScript base, `.gitignore`, typecheck and secret-scan CI    | 39326661524 (typecheck and secret-scan: success)           |
| 1de1967          | Lint, format, knip and Jest gates; protocol schema v1 and codec; ADR 0001 (Expo SDK)     | 39328464427 (success)                                      |
| a7dc5b6          | GlassesLink interface; capture indicator rule; virtual glasses simulator                 | 39330526836 (success)                                      |
| e42f28d          | Expo app skeleton on the virtual glasses link; bundled protocol schema                   | 39332927646 (failure: schema drift check; cause in QA-002) |
| fdb0b8a          | Fix the schema drift check by excluding the generated file from Prettier                 | 39333315890 (success)                                      |
| 765f968          | Gap, test and quality matrices; owner blocker entries; ADR 0001 revised for the cooldown | 39333936882 (success)                                      |
| 900c289          | Monthly spend cap decision logic with unit tests (G10)                                   | 39334527081 (success)                                      |

## Stage status

| Stage | Item                                                                 | Status                | Evidence level                                                                                              |
| ----- | -------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| A     | Monorepo skeleton (pnpm 12.5.1, strict TypeScript)                   | Integrated            | Static checks, CI                                                                                           |
| A     | Lint (ESLint strict), Prettier, knip                                 | Integrated            | Static checks, CI                                                                                           |
| A     | Jest with coverage thresholds (80 lines, 70 branches)                | Integrated            | Root: 96.9 percent lines, 94.3 percent branches                                                             |
| A     | Protocol schema v1 (`packages/protocol`) with codec and bundled JSON | Integrated            | Unit tests (9 tests) and a drift check in CI                                                                |
| A     | GlassesLink interface (`packages/core`)                              | Integrated            | Interface, used by the simulator and the app                                                                |
| A     | Virtual glasses simulator (`tools/simulator`)                        | Integrated            | Simulator evidence (8 tests)                                                                                |
| A     | Expo app skeleton (`apps/mobile`, SDK 58.0.14)                       | Integrated (no build) | Mobile unit and UI tests (4 tests); config check. No development build yet                                  |
| A     | Secret scan (gitleaks), CI                                           | Integrated            | CI runs above                                                                                               |
| B     | Capture indicator rule (G6)                                          | Implemented           | Unit and simulator tests. Simulator evidence only                                                           |
| B     | Gesture precedence and listening-session state machine (v9 5.0, 21)  | Implemented (logic)   | Unit tests over a 30-row precedence table; 100 percent coverage of the file. Not yet wired to the simulator |

| B | Locked-feature absence tests | Implemented (static) | Searches all source for Locked feature names; protocol checked for out-of-scope session types |

| B | Retention (24 hours or session end) and log redaction allowlist | Implemented (unit) | Temporary-item sweep and redaction tests with synthetic secrets. Saved-item deletion and export not built |

| D to G | Voice, vision, translation, memory | NOT STARTED | Stage D to G |
| H | Feature switch framework | NOT STARTED | Stage H |
| I | P-1 measurement harness and procedures | NOT STARTED | Stage I; owner runs (BLOCKER-005) |
| J | Firmware host-testable abstractions | NOT STARTED | Stage J; no firmware code yet |
| K | P-1 report template | NOT STARTED | Stage K |

## Decisions recorded

- Expo SDK: `expo@58.0.14`, pinned. The latest SDK 58 patch (58.0.16) is inside the 24-hour release-age cooldown, so it is not used. Details and the dated follow-up are in `docs/architecture/adr-0001-expo-sdk-version.md`.
- The release-age cooldown is not relaxed. Expo's installer proposed exemptions; they were removed (finding QA-001 in `QUALITY_AUDIT.md`).
- Workspace libraries (`core`, `protocol`, `simulator`) build to CommonJS. The app and the tests consume the built output.
- The protocol schema is the single contract. The app uses a JSON copy generated from the `.proto` file; CI fails if the copy drifts.
- Simulator and emulator results are labelled as such and are never reported as real-device evidence.

## Deviations and open points

- GitHub Actions are pinned to commit SHAs resolved from the release tags on the day of the change.
- `pnpm` is pinned to 12.5.1 in `package.json`, matching the lockfile.
- Mobile tests run with `pnpm -F @smartglass/mobile test`, and root `pnpm test` includes them. Mobile coverage is not measured in the root gate yet.
- The Expo SDK alignment is still open. See BLOCKER-003 (agent task due after 2026-10-20 14:40 UTC).
- Not yet in CI: Maestro end-to-end flows, a dependency audit step, and an accessibility check on screens (QA-004 and the Stage A test list in `TEST_MATRIX.md`).

## Matrices and registers

- `GAP_MATRIX.md`: all 54 v9 checklist items, with phase and status. 1 implemented (simulator), 1 unverified, 1 specified, 10 not started, 9 READY_FOR_OWNER, 32 NOT_DUE.
- `TEST_MATRIX.md`: suites, commands, evidence levels and last results.
- `QUALITY_AUDIT.md`: definition-of-done checks, findings and dispositions.
- `blocker.txt`: owner-facing actions, marked READY_FOR_OWNER, with step-by-step instructions. Variable names only, no values.

## What the owner needs to do first

1. Enrol in the Apple Developer Program and create an Expo account (BLOCKER-001, BLOCKER-002). Nothing iOS-specific can run on the owner's iPhone without these.
2. Decide the default-branch protection settings (BLOCKER-004). The agent cannot change them.
3. Check the GitHub Actions plan and minutes (BLOCKER-009) before emulator tests are added.
4. Decide the provider, the monthly cap and the broker hosting (BLOCKER-006) before any real-provider measurement.

The next agent steps, which need no owner action: the spend-cap logic and its mocked tests (Stage C), retention and log hygiene (Stage B), and the dependency audit gate in CI.
