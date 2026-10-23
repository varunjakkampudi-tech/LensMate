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

## BLOCKER-006 broker and BLOCKER-008 review (2026-10-24)

What was built (agent scope, mocks and a throwaway local PostgreSQL 17 only):

- Standalone Fastify broker, `services/broker`, with exact pins (fastify 5.12.7, pg 8.23.1, both published before the cooldown date). The broker is the only component that calls OpenRouter. Mock mode is the default and makes no provider call. Live mode is refused unless the key, a database and an owner cap confirmation equal to the cap are all present.
- Server-side spend cap: every attempt reserves its worst case under PostgreSQL row locks, in integer paise. Concurrency is tested with 100 parallel reservations, two connection pools, and 60 parallel HTTP requests.
- Authentication: bearer `<id>.<secret>`, secrets at least 32 characters, only SHA-256 hashes stored, constant-time comparison.
- Quotas and limits: daily request quota, per-client token bucket (per process), and concurrency guards.
- Model allowlist (`google/gemini-2.5-flash-lite` for text, `google/gemini-2.5-flash` for vision), an output ceiling, byte limits, unknown fields rejected and no type coercion.
- OpenRouter requests carry `provider.zdr: true` and `data_collection: "deny"`. Redirects are refused, error bodies are not read, and success bodies are capped at 256 KiB.
- App side: `packages/core/src/broker-client.ts` connects the existing Expo gateway. The token travels only in the Authorization header. Budget refusals, quota refusals and unauthorized responses stop retries at once, and a broker timeout is not retried.
- Deployment prepared, not built or deployed: hardened Dockerfile, compose stack with an internal database network, no published database port, file-based secrets, and an owner runbook at `services/broker/deploy/README.md`.
- Provider privacy and models recorded in `docs/governance/provider-privacy-and-models.md`, including the OpenRouter approval-status conflict, the upstream endpoint check still owed, and the capabilities OpenRouter cannot provide.

Independent review (BLOCKER-008): a fresh-context reviewer received the requirements, the file list and the test results, and changed nothing. Verdict: APPROVE WITH CONDITIONS. Findings and handling:

| #   | Severity        | Finding                                                                                                                                    | Handling                                                                                                                                                                                                                  |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High            | A reservation was released after a call that may have been billed (timeout, 5xx, or a reply without usage), so spend could be understated. | Fixed. Every failed attempt is now charged at worst case. Nothing is released after the provider was called. Tests updated. Cost of this choice: a long outage consumes budget at worst case, which needs owner approval. |
| 2   | Medium          | Reservations stuck by a crash or a database failure stayed open forever.                                                                   | Fixed. `reapStale` charges open reservations older than 5 minutes at worst case, every minute, with `SKIP LOCKED`. Integration test added.                                                                                |
| 3   | Medium          | The worst-case bound may not cover reasoning tokens for the vision model.                                                                  | Partly fixed. An alert is logged when actual cost exceeds the reservation. Verifying max_tokens against reasoning tokens with OpenRouter remains an owner condition.                                                      |
| 4   | Low             | Ledger failures returned 500.                                                                                                              | Fixed. Reserve failures return 503 LEDGER_UNAVAILABLE, and no provider call is made. Test added.                                                                                                                          |
| 5   | Low             | The app circuit breaker counted budget and authorization refusals as outages.                                                              | Fixed. Only transient outcomes open the circuit. Test added.                                                                                                                                                              |
| 6   | Low             | A broker timeout was retried by the app, multiplying calls.                                                                                | Fixed. Timeouts map to a non-retryable TIMEOUT. Test added.                                                                                                                                                               |
| 7   | Low             | Unauthenticated requests are validated before authentication, so body size is a resource issue.                                            | Open. To be enforced at the reverse proxy (size limit and pre-auth rate limit). Owner condition on the proxy.                                                                                                             |
| 8   | Low             | Provider and broker response bodies were unbounded.                                                                                        | Fixed for provider success bodies (256 KiB, streamed and capped) and broker replies (1 MB). Redirects refused. Tests added.                                                                                               |
| 9   | Low             | The pool had no error listener, so an idle connection error would crash the process.                                                       | Fixed. Listener added, logs a message only.                                                                                                                                                                               |
| 10  | Low, unverified | The Postgres container may not start with cap_drop ALL.                                                                                    | Fixed as far as possible without Docker: only CHOWN, DAC_OVERRIDE, FOWNER, SETGID and SETUID added, plus a /tmp tmpfs. Not run.                                                                                           |
| 11  | Info            | Dependency advisories not checked.                                                                                                         | Checked. `pnpm audit --prod` reports node-forge and zod through the Expo CLI in the mobile app. No advisory is reported under the broker's own dependencies.                                                              |
| 12  | Info            | Client secrets were accepted at 16 characters.                                                                                             | Fixed. Minimum is now 32 characters.                                                                                                                                                                                      |

Test results (2026-10-24, with PostgreSQL 17 on a throwaway local instance):

- Root: 291 tests passed, including 10 PostgreSQL integration tests. Mobile: 50 passed. Coverage thresholds met.
- Lint, typecheck, format, knip, build, schema check, `check:expo`: passed.
- `pnpm audit --prod --audit-level=high`: node-forge and zod through the mobile app's Expo CLI (BLOCKER-010). None under the broker.
- Secret-pattern scan of tracked and new files: no hits. Test placeholders use the `DO-NOT-USE` marker.

Not verified: the Docker image and compose stack (Docker is not running here); live OpenRouter behaviour (no billable call was made); production log retention; the reverse proxy and TLS.

Status: BLOCKER-006 READY_FOR_OWNER. The broker is implemented and reviewed, but it is not production-ready and is not validated against live OpenRouter. Real calls stay blocked until the owner confirms the cap, authorizes testing, and approves hosting.

### BLOCKER-006 remediation after the second review (2026-10-24)

The second review's conditions were applied before integration. Verdict on the reviewed version: APPROVE WITH CONDITIONS. The fixes below are not yet re-reviewed by a fresh-context reviewer, so they are not treated as approval; that re-review is still required.

Database roles and schema (`services/broker/src/schema.ts`):

- Three roles: the owner (migrator, runs `migrate-cli` only), the application role (runtime) and the admin role (enrolment codes and revocation, server-side only). `migrate()` refuses the same role for app and admin, refuses reserved or unsafe role names before any SQL, and refuses to run as the app or admin role.
- The application role has no CREATE, DROP, ALTER, DELETE, or rights on enrolment-code issuance or revocation. The admin role cannot delete rows or migrate.
- Immutability triggers, applied to every role including the owner: revocation is permanent, a used enrolment code cannot be made usable again, and recorded spend cannot decrease.
- The start-up schema guard checks every ledger table and required column, and names what is missing.

Backup and restore (`services/broker/deploy/backup/`):

- No database password appears on any command line. A connection URL that contains a password is refused. libpq reads the password from `PGPASSFILE` (mode 0600 on the server).
- Each encrypted backup has an HMAC-SHA256 integrity tag, computed with a separate key. Restore verifies the tag before decrypting anything.
- Restore refuses a target that already holds `broker_*` tables and requires the target name to be typed.
- Cleanup of partial files runs on any exit, not only on error.
- Windows caveat: the key-file mode check (no group or other access) refuses on Windows, because Windows reports 644. The round trip below ran on a scratch copy with that one check removed. The owner must run these scripts on the Linux VPS, where the check is meaningful.

Enrolment and revocation (`services/broker/src/devices.ts`, `server.test.ts`, `security.integration.test.ts`):

- Codes are issued only through the admin role or the owner-run `admin-cli`. The application role cannot insert codes (tested: permission denied).
- Replay is refused (one redemption only). An unknown code and an expired code return the same answer as a used one (HTTP 403 with an identical body, tested). Enrolment is rate limited (429, tested).
- Ten concurrent redemptions of one code register exactly one device (tested).
- A revoked device is refused on its next request (HTTP 401, tested). A revoked device cannot be un-revoked, even by the owner (trigger, tested).
- A stored hash of the device secret cannot be presented as the secret (tested).
- Known limit: the enrolment rate limit is one global bucket, so a flood of wrong codes can block a legitimate enrolment for about a minute (review finding 6, owner condition for a single-instance deployment).

Ledger loss or corruption:

- A missing table or a missing required column stops the broker at start-up before it listens (tested: names the table and the column).
- A restored backup keeps its recorded spend (tested: spend 120 and device count 1 after restore). The cap itself comes from configuration, not from the ledger, so a restore cannot raise the cap. Calls are refused once the restored spend reaches the cap (existing reservation tests).
- Not tested: the broker starting against a restored ledger with a deleted reservation row. That case is unverified.

App client (`packages/core/src/broker-client.ts`): `JSON.parse` of the enrolment success body is now guarded, and a malformed success reply is refused as `MALFORMED_REPLY`.

Configuration: `BROKER_CLIENTS_JSON` is retired from the env template and the deploy notes. Compose adds the admin role password secret and `docker-compose.admin.yml` for the owner-only admin CLI. The broker container never receives the admin URL.

Test results (2026-10-24, PostgreSQL 17 on a throwaway local instance on 127.0.0.1:5433):

- `pnpm test` with `BROKER_TEST_DATABASE_URL` set: 26 of 26 suites and 324 of 324 tests in the root project, 7 of 7 suites and 50 of 50 tests in the mobile project.
- Backup and restore round trip (scratch databases, dropped afterwards): backup written with its tag; restore into an empty database reproduced spend 120 and device count 1; a non-empty target, a mismatched confirmation, a tampered file, a wrong MAC key, a password in either URL, and retention of a 2020-dated backup all behaved as required.
- Typecheck, lint, format, knip, build, `check:schema` and `check:expo` passed. Those results are recorded in the commit message and the report.

CI on dev: commit 3089624 failed all three jobs. Secret scan flagged a device-secret fixture in the app client test; quality failed the 80 percent line-coverage threshold (79.77 percent, because PostgreSQL-only code is skipped in that job); broker-integration had two tests fail with "terminating connection due to administrator command" (server FATAL messages, cause not confirmed from server logs). Commit 0f2456c fixed the fixture, added unit tests for the admin commands and the environment reader (line coverage now 80.84 percent without PostgreSQL), and made the PostgreSQL suite record idle-session errors and close pools before dropping the test database. Run 40039813709 on 0f2456c: quality, broker-integration and secret-scan all succeeded.

Not verified: the Docker image and compose stack (Docker is not running here); the init script running inside the Postgres container; the reverse proxy, TLS and the pre-authentication body size limit (review finding 7); live OpenRouter behaviour; the mobile secure-storage integration (not started, needs an owner-approved Expo dependency).

Status: BLOCKER-006 remains OPEN. It is not resolved by these fixes.

## BLOCKER-005 measurement workflow (2026-10-24)

Scope of this step: the agent-owned measurement workflow for the simulator, made operational. No physical device was used, no provider was called, and no measurement was invented.

Implemented:

- Measurement screen (`apps/mobile/src/measurement-screen.tsx`), reached from the home screen. Session controls (start, end), a simulated single tap, provenance entry (run ID, evidence level, who ran the test, device, OS, app build and commit, EAS build ID, network type, provider, sample set, optional battery), the language of the tries (English, Telugu, Hindi, mixed speech), the count of tries per language, clear error and alert states, and CSV export with the validator result. Provenance is locked while a session runs.
- Pure rules (`apps/mobile/src/measurement-session.ts`): the provenance checks, the recorder context, the measure status table (only capture to phone is instrumented; everything else is labelled NOT INSTRUMENTED), and the tallies.
- Timing source: the validator now carries a `timing_source` column. The only supported value is `same_clock_simulator`, meaning both timestamps come from one clock. Any transport source is rejected until a clock synchronization is validated. The summary keeps timing sources apart.
- The screen and the glasses share one clock. A mismatched clock produces failed tries with the reason, never a latency.
- Owner procedure (`docs/measurements/procedures/iphone15-procedures.md`): the simulator workflow is executable. The iPhone run lists its requirements and is not yet runnable.
- Traceability matrix and test inventory (`docs/measurements/traceability.md`).

Tests (all passing locally before commit):

- Root: 184 tests (core measurement, CLI, existing suites), coverage above the thresholds (96.7 percent lines, 89.1 percent branches).
- Mobile: 49 tests, including the measurement session rules, the recorder, the screen component and accessibility checks, the end-to-end workflow through the virtual glasses, the mismatched-clock test, and the dry run.
- Gates: format, lint, typecheck (root and mobile), knip, build, schema check, `check:expo`, and the secret-pattern scan.

Defects found and fixed during this step:

- Battery value 101 was accepted. The range check now enforces 0 to 100, matching the validator.
- The screen shared the recorder's mutable array with React state, so later taps did not re-render. The screen now stores a copy.
- The end-to-end tests missed the state update until `fireEvent` calls were awaited. All UI tests now await them.
- The end-to-end file had a timeout that was passed to `it` by mistake, and could time out under coverage. It now uses a file-level timeout of 30 seconds and a 10-second find timeout.

Independent review: not required for this step. BLOCKER-008 covers the provider broker, authentication, pairing, permissions and firmware update code. This step changes none of those. It does not change the capture indicator, the session state machine or any permission. The simulator's button method already existed and is used only by tests and the simulator screen.

What is still owner-pending or dependent on future work:

- Owner-run iPhone measurements: owner-pending, needs BLOCKER-001 (Apple membership), an EAS build, and a VoiceOver pass on the device. Real-phone acceptance stays READY_FOR_OWNER until owner-run results are imported and validated.
- latency_total, interruption, speech accuracy, translation and spend: NOT INSTRUMENTED. They depend on speech recognition, translation, speech output and provider pipelines.
- Transport timing (Bluetooth glasses): depends on a validated clock synchronization, which does not exist yet.

Status: BLOCKER-005 READY_FOR_OWNER. Agent simulator workflow complete. Agent instrumentation for the unsupported measures not started (dependent on future work).

## BLOCKER-004 hardening verification (2026-10-24, read-only, after the owner's update)

- Ruleset `Protect Production Main`, id 25755233: `enforcement: active`, target `branch`, include `~DEFAULT_BRANCH` (`main` only). The rules list `deletion`, `non_fast_forward`, `required_status_checks`, `required_linear_history`, `code_quality` (severity all) and `update`.
- Restrict updates: enabled (`update` rule present, and it appears in the effective rules for `main`).
- Bypass actors: one, `actor_id 197045755` with type `User` and bypass mode `always`. `GET users/varunjakkampudi-tech` returns id 197045755, so the actor is the owner account. `current_user_can_bypass: always`.
- Other actors: no team (`repos/.../teams` returns 404 for this personal repository), no installed app with bypass (no app appears in `bypass_actors`), and the collaborator list (`affiliation=all`) has one user, the owner, with role `admin`.
- Required status checks: `quality` and `secret-scan`, both `integration_id 15368` (GitHub Actions), `strict_required_status_checks_policy: true`.
- Deletion and force-push restrictions: active.
- `dev`: no rules (`repos/.../rules/branches/dev` returns zero). Direct commits to `dev` remain permitted.
- Dependabot alerts: enabled (HTTP 204). Dependabot security updates: enabled. Secret scanning: enabled. Push protection: enabled. Validity checks and non-provider patterns: disabled (optional). Automated security fixes: enabled.
- Branches: `main` and `dev` only.

Documented risk: the owner's `always` bypass lets the owner update `main` and bypass the required checks. This is accepted for a single-owner repository. Production promotion still needs a manual check of the `dev` commit and explicit owner approval for each promotion (see `docs/governance/git-branch-policy.md`).

Status: BLOCKER-004 RESOLVED, FULLY HARDENED. No unintended actor can update `main`.

Not tested: a direct push to `main` was not attempted, because that would change production.

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
| I | P-1 measurement harness and procedures | PARTIAL | Simulator workflow complete (screen, validator, dry run, tests). Owner iPhone runs and unsupported measures remain (BLOCKER-005) |
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

### BLOCKER-006 mobile secure-storage integration (2026-10-24)

- Owner approved `expo-secure-store` (installed `~58.0.2`, SDK-aligned, published 2026-10-01, outside the two-week cooldown). Registered as an Expo config plugin; `allowBackup` stays `false`.
- `apps/mobile/src/device-credential.ts`: stores this phone's own `{deviceId, deviceSecret}` in device secure storage with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. `enrolThisDevice` exchanges the owner's single-use code through core's `enrolDevice` and returns only the device id. No broker secret is in the bundle.
- Tests: 7 new mobile tests (round trip, absent, malformed value removed, clear, accessibility option, enrolment success, refused code stores nothing). Full `pnpm test`: root 302 passed, mobile 57 passed in total.
- Not done: no enrolment screen is wired in the UI yet, and no device run was made. The request path to the broker still needs a configured base URL.
- BLOCKER-006 remains OPEN.

### BLOCKER-006 mobile enrolment and fresh-context security review (2026-10-24)

Built: an accessible enrolment screen (`apps/mobile/src/enrolment-screen.tsx`, reached from the home screen) that takes an owner-issued code and a phone name. The broker address comes only from `EXPO_PUBLIC_BROKER_BASE_URL`, validated by `broker-config.ts` (https, or loopback http for development; no credentials, query, fragment or path). Nothing is hardcoded. Success shows only the device id. Failures show fixed, safe text. Broker usage is gated by `broker-access.ts`: it needs a configured address, a well-formed device credential, and an accepted cloud-processing disclosure. The disclosure version is still null, because owner decision (e) is not approved, so broker usage stays unavailable.

Credential lifecycle (`device-credential.ts`): validation of the stored shape and lengths; a read-back check on every write; fixed failure codes for read, write and delete; no automatic clearing (a damaged credential needs a second explicit tap); enrolment refused while a credential is stored; one enrolment at a time; one retry of the local save, then `REGISTERED_BUT_NOT_STORED` with the device id so the owner can revoke it.

Fresh-context review (read-only subagent; scope: broker auth and enrolment, schema roles and triggers, backup and restore, compose, core client, mobile authentication). Verdict: APPROVE WITH CONDITIONS. No confirmed high-severity defect. Handling:

| #   | Severity           | Finding                                                                             | Handling                                                                                                                                                                    |
| --- | ------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium             | Backup URL guard missed `?password=` and passwords with `/`.                        | Fixed in `lib.sh`. Checked: userinfo with a colon and a `password=` query are refused; `user@host` and host-only URLs are allowed.                                          |
| 2   | Medium (procedure) | Restoring an older dump lowers recorded spend, which resets the cap.                | Open, owner condition. Restore must keep spend at or above the highest recorded value, or the owner must attest in writing. Not automated.                                  |
| 3   | Low                | Triggers can be dropped or disabled by the table owner, unnoticed at start-up.      | Fixed. `verifySchema` requires the three triggers to exist and be enabled. Tests added for a dropped and a disabled trigger. Trigger comment corrected.                     |
| 4   | Low                | Application role can register devices and zero reservations.                        | Accepted as defence in depth. Spend cannot decrease (trigger). Noted for the next schema revision.                                                                          |
| 5   | Low                | One-off compose containers inherit the base service secrets.                        | Fixed in `docker-compose.admin.yml` and `docker-compose.migrate.yml` with `secrets: !override`. Not run: `docker compose config` needs Docker, which is not available here. |
| 6   | Low                | Role passwords passed to `psql -v` during first-start init.                         | Residual risk, first start only. Noted.                                                                                                                                     |
| 7   | Low                | Enrolment rate limit is one global bucket, so it can be drained to block the owner. | Accepted. Brute force is infeasible (about 78 bits). Owner to choose a per-source limit at the proxy.                                                                       |
| 8   | Low                | No broker call path exists yet; any future caller must use `resolveBrokerAccess`.   | Noted.                                                                                                                                                                      |
| 9   | Low                | `enrolThisDevice` could overwrite a damaged credential silently.                    | Fixed. It now refuses with `STORED_CREDENTIAL_INVALID`. Test added.                                                                                                         |
| 10  | Info               | A reply lost after registration leaves an orphan device with no id reported.        | Residual. The secret is unknown to anyone, so it is harmless, but the owner cannot see its id. Noted.                                                                       |
| 11  | Info               | Minor modulo bias in code generation.                                               | Negligible. Not changed.                                                                                                                                                    |

Test evidence (2026-10-24, PostgreSQL 17 on a throwaway local instance): `pnpm test` with `BROKER_TEST_DATABASE_URL` set passed 28 of 28 root suites (335 tests, including the trigger-verification tests) and 11 of 11 mobile suites (89 tests). Typecheck, lint, format, knip, build, `check:schema` and `check:expo` all passed.

Not verified: a real device or simulator run; the Docker image and compose stack; the reverse proxy and body limit (finding 7 owner decision); live OpenRouter. The review is not a re-review of the fixes above, so these fixes are not approved until a fresh reviewer checks them.

Status: BLOCKER-006 remains OPEN.
