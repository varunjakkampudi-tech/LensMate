# PROGRESS

## Checkpoint 3 (after the Stage B and C slice)

Added: gesture precedence (Stage B), Locked-feature absence test (Stage B), log redaction allowlist and temporary retention (Stage B, partial), provider gateway with mocks and disclosure gate (Stage C, partial), and a scheduled dependency audit that is blocked on the owner waiver decision (BLOCKER-010). Local gates pass: typecheck, lint, format, knip, 102 root tests, 4 mobile tests.

Still open: the Stage C broker (needs owner hosting and keys), Stages D to G (voice, vision, translation, memory), the Stage H switch framework, Stage I harness, Stage J firmware, Stage K report, Maestro flows, and saved-item deletion and export.

## Summary at this stop

Completed and verified on main: monorepo, strict typing, lint, format, knip, Jest gates, secret scan, protocol schema v1 with drift check, GlassesLink, capture indicator rule, virtual glasses simulator, Expo app skeleton (development-build config, not built), spend cap decision logic, and the matrices. Last CI run on main: 39334527081 (success).

Stage B (gesture precedence, listening sessions, Locked-feature absence) is integrated in 927ab18. Stopped here, not blocked: the rest of Stage B (retention and log hygiene), Stage C gateway with mocks, the dependency audit gate, and the Maestro flows are unblocked and are the next steps. They are large, so they are not started in this session. Blocked on owner: BLOCKER-001 (deferred until iPhone testing), 004, 006, 007, 009. BLOCKER-002 and BLOCKER-003 are resolved on 2026-10-24.

Owner approval: OWNER-APPROVAL-001 in `blocker.txt` (RESOLVED, 2026-10-20, on main). The smart glasses goal is ACTIVE. Its direct-to-main exception is superseded for development by OWNER-DECISION-002 (2026-10-24): all development goes to `dev`, and `main` changes need owner approval. Policy: `docs/governance/git-branch-policy.md`.

Status is reported per item with its evidence level. Nothing is marked complete without evidence. No real-phone, hardware, or provider result exists yet.

## Branch migration (2026-10-24, OWNER-DECISION-002)

- Policy: two permanent branches, `main` (production) and `dev` (development). Development is committed and pushed directly to `dev`. `main` changes need owner approval. See `docs/governance/git-branch-policy.md`.
- Backup before any change: `C:/Users/Admin/LensMate-git-backup/2026-10-24/lensmate-all-refs.bundle`, all refs, verified with `git bundle verify`. Ref list saved as `refs-before.txt` in the same folder.
- Baseline: `main` and `origin/main` were both at `6f9903a` before the migration. No commit was pushed to `main`. The EAS link commit is carried onto `dev` and is waiting for owner approval to promote.
- Created `dev` from `origin/main` and pushed it to `origin/dev` with upstream tracking.
- Branch `claude/lensmate-blocker-002-eas-a26e60` was created earlier for the EAS work. Its commit was re-applied on `dev` with identical file content, so the local branch was deleted after verification. The remote branch `origin/claude/lensmate-blocker-002-eas-a26e60` is kept until the owner authorizes its deletion.
- Local branches now: `main` (checked out in the root checkout) and `dev` (checked out in the session worktree). Git allows a branch to be checked out in one worktree at a time, so the root checkout stays on `main`.
- CI workflow now runs on pushes to `dev` as well as `main`. Pull request runs are unchanged.

## BLOCKER-005 measurement readiness (2026-10-24)

Implemented in this step (agent work):

- Targets from LensMate-v9 section 6.4 (verified against the local copy of LensMate-v9.md): capture to phone 300 ms; recognition first words 500 ms; first sentence 1000 ms; speech output 500 ms; total short request under 2500 ms. Interruption 500 ms in at least 95 percent of tries (G19). Latency acceptance: 50 requests per language, at least 90 percent meeting the budget (Goal 14.2). Targets are design targets, not proven performance.
- Core measurement module (`packages/core/src/measurement`): interval and threshold calculations, per-language evaluation, and the acceptance rules. Boundaries are tested (300, 500, 2499 and 2500 ms; 45 of 50; 19 of 20; 89.9 percent does not round up).
- Import validator (`importMeasurementCsv`) and CLI (`pnpm measure:import <file>`, package `tools/measurement-import`). It rejects missing provenance, invalid or reversed marks, duplicate IDs, unsupported measures, evidence claims above simulator, emulator and real phone, real-phone claims by the agent or on a simulator device, and personal-data patterns. Simulator rows are reported apart from real-phone rows.
- In-app capture-to-phone recorder (`apps/mobile/src/measurement-recorder.ts`). It times capture from the glasses' own button timestamp (`VirtualGlasses.lastButtonAtMs`) to the phone's receipt, using events only. A try that cannot be timed is recorded as failed, never estimated. The recorder is not yet wired to a screen.
- Simulator dry run (`pnpm measure:dry-run`, `apps/mobile/src/measurement-dry-run.test.ts`): 50 scripted presses in English and 50 in Telugu through the virtual glasses, exported and accepted by the validator as simulator evidence. Labelled as a dry run, not a physical-iPhone measurement.
- Procedures: `docs/measurements/procedures/iphone15-procedures.md`, marked NOT RUNNABLE, because the phone app has no tap control, provenance form or export yet. Template: `docs/measurements/evidence-template.csv`, with the header generated from the validator. Traceability: `docs/measurements/traceability.md`.

Not done (and why):

- Latency total, interruption, speech accuracy, translation and spend are not instrumented on the phone. Recognition, translation and speech output do not exist in the app yet, so those stages have no events to time. The validator rejects these measures until they are instrumented.
- Measurement screen in the phone app: not built. The owner cannot run any real-phone test until it exists.
- No real-phone result exists. No dummy evidence was created. No physical device, paid service, OpenRouter call or Apple purchase was used.

Status: BLOCKER-005 READY_FOR_OWNER. Agent implementation partially complete. BLOCKER-001 deferred.

Tests run for this step: typecheck, lint, format, knip, schema check, `check:expo`, and the full test suites (root 181 tests with coverage thresholds met; mobile 14 tests). The simulator dry run passed.

## BLOCKER-004 verification (2026-10-24, final, read-only)

- Ruleset `Protect Production Main`, id 25755233: `enforcement: active`, `target: branch`, `conditions.ref_name.include: ["~DEFAULT_BRANCH"]` (resolves to `main` only). Only ruleset in the repository.
- Rules: `deletion`, `non_fast_forward`, `required_status_checks` with `quality` and `secret-scan`, each `integration_id: 15368` (GitHub Actions), `strict_required_status_checks_policy: true`, `required_linear_history`, `code_quality` (severity all).
- Bypass actors: none. `current_user_can_bypass: never`.
- `dev`: no rules (`repos/.../rules/branches/dev` returns zero rules). Direct pushes to `dev` remain allowed. Earlier direct pushes to `dev` (`2e522cd`, `359b618`) succeeded before the ruleset update. Since `dev` has no rules, the ruleset update does not change that. Classic branch protection on `main`: none (HTTP 404), which is intended.
- Dependabot alerts: enabled (`vulnerability-alerts` HTTP 204). Dependabot security updates: enabled. Secret scanning: enabled. Push protection: enabled. Secret-scanning validity checks and non-provider patterns: disabled (optional). Open secret-scanning alerts: 0.
- Collaborators with access (`affiliation=all`): only the owner account, with admin and push. No teams.
- Branches: `main` and `dev` only.
- Not tested, by design: a direct push to `main` was not attempted, because that would change the production branch. Expected behavior from the documented rules: a direct push of new commits to `main` is refused until `quality` and `secret-scan` have passed for that commit. Treat as unverified until tested on a safe test case the owner approves.
- Future-collaborator risk (not a blocker): see BLOCKER-004 in `blocker.txt`. Restrict updates on `main` to the owner, or require a pull request with owner approval, before adding any collaborator with write access.

Status: BLOCKER-004 RESOLVED for the mandatory controls.

## BLOCKER-004 audit (2026-10-24)

Read-only GitHub checks (`gh api`, no settings changed):

- Default branch `main`. Branches on origin: `main` and `dev` only.
- `main` branch protection: not configured (HTTP 404). Repository rulesets: none.
- Secret scanning: enabled. Push protection: enabled. Validity checks and non-provider patterns: disabled.
- Dependabot security updates: disabled. Vulnerability alerts: disabled (HTTP 404). No `.github/dependabot.yml` (a version-update config would open routine PRs, which the branch policy does not allow).
- Repository visibility: public.
- Open secret-scanning alerts: none (API returned an empty list).

Workflow review (`.github/workflows/ci.yml`, `audit.yml`):

- Each job has read-only `contents` permission, and every action is pinned to a commit SHA. `persist-credentials: false` is set on checkout. Node 22 and `pnpm install --frozen-lockfile` are used.
- `quality` runs typecheck, lint, format, knip, build, the schema check, the Expo config check and the test suite. `secret-scan` runs gitleaks on full history.
- Runs trigger on pushes to `main` and `dev`, and on pull requests. The required status checks for `main` protection are `quality` and `secret-scan`.
- Known gap: the dependency audit (`audit.yml`) runs only on schedule and on demand, and it does not block pushes (BLOCKER-010).
- Warning in the run annotations: `actions/checkout` and the gitleaks action run on Node 20 forced to Node 24. Their pins should be refreshed when the owner next approves action updates.

Remote branches: `origin/claude/lensmate-blocker-002-eas-a26e60` was no longer present on the remote at this check. It was deleted outside this session. Its commit `4f55bbc` is preserved on `dev` as `4a78a51` (identical file content) and in the backup bundle. No remote branch was deleted by the agent in this step.

Local changes in this step:

- Windows CRLF formatting failure fixed: `.gitattributes` sets `* text=auto eol=lf`, and the working-copy files were rewritten to LF. `pnpm format:check` now passes in this checkout (it previously flagged 67 files that were otherwise correct). The Git index was already LF, so no tracked content changed.
- React peer mismatch fixed: `react-dom` is pinned to `19.3.0` in `apps/mobile`, the version Expo's bundled module list expects. Before the pin, `react-dom@19.3.1` was resolved through `@expo/metro-runtime` and required `react@^19.3.1`. `pnpm peers check` now reports no issues, and `npx expo install --check` still reports up to date. `react-dom@19.3.0` was published 2026-09-09, outside the cooldown. No other dependency was upgraded.

Gate results for this step (local, CI-equivalent): install (frozen), typecheck, lint, format, knip, build, schema check, `check:expo`, and tests (110 root and 4 mobile) all pass. A local gitleaks run was not possible because gitleaks is not installed here. A targeted pattern scan of tracked files and of the staged diff found no key or token patterns. The CI `secret-scan` job is the full check.

Status: BLOCKER-004 stays OPEN until the owner configures branch protection on `main` and enables Dependabot security updates, and those settings are verified read-only.

Verification after the owner's changes (2026-10-24, read-only, `gh api`; no settings changed by the agent):

- Ruleset `Protect Production Main`, id 25755233: active, source `varunjakkampudi-tech/LensMate`, target `~DEFAULT_BRANCH` (resolves to `main`). `dev` has no rules (`repos/.../rules/branches/dev` returns none), so direct pushes to `dev` are allowed. Confirmed by the push of `2e522cd` to `dev`.
- Rules on `main`: `deletion`, `non_fast_forward` (blocks force-push), `required_linear_history`, `code_quality` (severity all), and `required_status_checks`.
- Required status checks: EMPTY. The rule has `required_status_checks: []`, so neither `quality` nor `secret-scan` is required, and no check source is pinned. This is the blocking gap.
- Bypass actors: none. `current_user_can_bypass` is `never`, so the owner cannot bypass the ruleset either.
- Classic branch protection on `main`: not configured (HTTP 404). Not needed alongside the ruleset.
- Promotion permissions: the collaborator list (`affiliation=all`) has one user, the owner, with admin and push. There are no teams and no other collaborators, so no non-owner can push to `main` today. The ruleset does not enforce this on its own. It has no "restrict updates" rule and no pull-request rule, so owner-only control depends on membership, not on the ruleset.
- Security settings: Dependabot alerts enabled (`vulnerability-alerts` returns 204). Dependabot security updates enabled. Secret scanning enabled. Push protection enabled. Secret-scanning validity checks and non-provider patterns disabled (optional). Open secret-scanning alerts: 0.
- Branches: `main` and `dev` only.

Previous re-verification (2026-10-24, earlier): unchanged at that time. Default branch `main`; branches `main` and `dev`; `main` not protected (HTTP 404); no rulesets; secret scanning and push protection enabled; validity checks and non-provider patterns disabled; Dependabot security updates disabled; vulnerability alerts disabled (HTTP 404); no open secret-scanning alerts.

## BLOCKER-003 result (2026-10-24)

- Cooldown check: the target versions were published 2026-10-19 to 2026-10-21, outside the 24-hour release-age window. No exemption was added.
- Pins moved in `apps/mobile/package.json`: `expo` 58.0.14 → 58.0.17 (exact pin, per ADR-0001), `expo-constants` ~58.0.13, `expo-linking` ~58.0.14, `expo-router` ~58.0.25, `expo-updates` ~58.0.18, `jest-expo` ~58.0.12 (dev).
- `pnpm install` updated the lockfile (41 packages added or changed). The new transitive packages are Expo's own (`@expo/cli`, `@expo/metro-config`, `expo-modules-*`, `noxcturnal`, `xcode`). Each was published 2026-10-19 to 2026-10-21, outside the cooldown.
- `npx expo install --check`: "Dependencies are up to date".
- Gates after the change: typecheck, lint, knip, schema check, `pnpm check:expo`, and the full test suite (110 root and 4 mobile tests) all pass.
- Peer warning from `pnpm peers check`: `react-dom@19.3.1` wants `react` ^19.3.1 while `react@19.3.0` is installed. The same `react-dom@19.3.1` peer was already in the lockfile before this change. Not changed here. Recorded as an open point for the next SDK alignment.

## BLOCKER-002 verification (2026-10-24)

- EAS project linked to the existing Expo project `@varun1408/lensmate`, ID `2fb3599f-8a9d-4f26-85c0-ad9669a6f23b`. Stored at `extra.eas.projectId` in `apps/mobile/app.config.ts`; no other setting changed.
- `eas whoami` returns the owner account `varun1408` (no token printed or stored). `eas project:info` (run from `apps/mobile`) returns the project name and the same ID.
- `pnpm check:expo` (`expo config --type public`) passes and resolves `extra.eas.projectId`.
- Local gates on the change: `pnpm typecheck` pass, `pnpm lint` pass, `pnpm test` pass (110 root tests, 4 mobile tests), `pnpm check:schema` pass, `pnpm knip` pass.
- `pnpm format:check` reports 67 files on this Windows checkout. Each one passes Prettier once its line endings are normalized to LF, and the index stores LF, so this is a CRLF working-copy artifact, not a formatting defect. Not fixed here because it is outside this change.
- Not run: any EAS build (owner-only, and BLOCKER-001 is needed for iOS). `eas init` was not re-run because it cannot write a dynamic config.

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

| Stage | Item                                                                 | Status                | Evidence level                                                                                                                                      |
| ----- | -------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Monorepo skeleton (pnpm 12.5.1, strict TypeScript)                   | Integrated            | Static checks, CI                                                                                                                                   |
| A     | Lint (ESLint strict), Prettier, knip                                 | Integrated            | Static checks, CI                                                                                                                                   |
| A     | Jest with coverage thresholds (80 lines, 70 branches)                | Integrated            | Root: 96.9 percent lines, 94.3 percent branches                                                                                                     |
| A     | Protocol schema v1 (`packages/protocol`) with codec and bundled JSON | Integrated            | Unit tests (9 tests) and a drift check in CI                                                                                                        |
| A     | GlassesLink interface (`packages/core`)                              | Integrated            | Interface, used by the simulator and the app                                                                                                        |
| A     | Virtual glasses simulator (`tools/simulator`)                        | Integrated            | Simulator evidence (8 tests)                                                                                                                        |
| A     | Expo app skeleton (`apps/mobile`, SDK 58.0.14)                       | Integrated (no build) | Mobile unit and UI tests (4 tests); config check. No development build yet                                                                          |
| A     | Secret scan (gitleaks), CI                                           | Integrated            | CI runs above                                                                                                                                       |
| B     | Capture indicator rule (G6)                                          | Implemented           | Unit and simulator tests. Simulator evidence only                                                                                                   |
| B     | Gesture precedence and listening-session state machine (v9 5.0, 21)  | Implemented (logic)   | Unit tests over a 30-row precedence table; 100 percent coverage of the file. Wired into the virtual glasses (7 gesture and listening-session tests) |

| B | Locked-feature absence tests | Implemented (static) | Searches all source for Locked feature names; protocol checked for out-of-scope session types |

| B | Retention (24 hours or session end) and log redaction allowlist | Implemented (unit) | Temporary-item sweep and redaction tests with synthetic secrets. Saved-item deletion and export not built |

| C | Provider gateway: disclosure gate, spend cap per attempt, timeout, bounded retries, circuit breaker | Implemented (unit, mocks) | 12 tests with a scripted mock provider. No real provider and no broker yet (BLOCKER-006) |
| C | Dependency audit gate | Blocked (BLOCKER-010) | Scheduled workflow reports 2 high advisories with no published fix. Not yet a blocking gate, pending owner waiver decision |
| D to G | Voice, vision, translation, memory | NOT STARTED | Stage D to G |
| H | Feature switch framework | NOT STARTED | Stage H |
| I | P-1 measurement harness and procedures | PARTIAL | Import validator, CLI, capture-to-phone recorder, simulator dry run, templates. Measurement screen and latency_total, interruption, speech, translation and spend instrumentation not done. Owner runs (BLOCKER-005) |
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
- Mobile tests run with `pnpm -F @lensmate/mobile test`, and root `pnpm test` includes them. Mobile coverage is not measured in the root gate yet.
- The Expo SDK alignment is closed (BLOCKER-003, 2026-10-24). See "BLOCKER-003 result" above and ADR-0001.
- Not yet in CI: Maestro end-to-end flows, a dependency audit step, and an accessibility check on screens (QA-004 and the Stage A test list in `TEST_MATRIX.md`).

## Matrices and registers

- `GAP_MATRIX.md`: all 54 v9 checklist items, with phase and status. 1 implemented (simulator), 1 unverified, 1 specified, 10 not started, 9 READY_FOR_OWNER, 32 NOT_DUE.
- `TEST_MATRIX.md`: suites, commands, evidence levels and last results.
- `QUALITY_AUDIT.md`: definition-of-done checks, findings and dispositions.
- `blocker.txt`: owner-facing actions, marked READY_FOR_OWNER, with step-by-step instructions. Variable names only, no values.

## What the owner needs to do first

1. Enrol in the Apple Developer Program (BLOCKER-001). Nothing iOS-specific can run on the owner's iPhone without it. The Expo account and EAS project are done (BLOCKER-002).
2. Decide the default-branch protection settings (BLOCKER-004). The agent cannot change them.
3. Check the GitHub Actions plan and minutes (BLOCKER-009) before emulator tests are added.
4. Decide the provider, the monthly cap and the broker hosting (BLOCKER-006) before any real-provider measurement.

The next agent steps, which need no owner action: the spend-cap logic and its mocked tests (Stage C), retention and log hygiene (Stage B), and the dependency audit gate in CI.
