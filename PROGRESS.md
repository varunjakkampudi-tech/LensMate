# PROGRESS

## Repository cleanup and engineering baseline (2026-10-26)

- Audited the tracked JavaScript/TypeScript files with Knip for unused files, exports, dependencies, and unlisted dependencies. Removed the test-only `brokerProviderRun` adapter, its package export, and its adapter-only tests after confirming it had no production caller; the standalone `ProviderGateway` remains exercised by its own tests and the app's simulator demo. No source module or image was otherwise orphaned: the available assets are referenced by Expo config, the web app manifest/head tags, or the PWA service-worker shell.
- ESLint now includes `apps/mobile` TypeScript and TSX, excluding only Expo-generated `.expo` output and the separately tested public service worker. Mobile files use non-type-aware ESLint rules; the app's TypeScript project remains the typecheck gate. The newly enabled lint run passes after resolving its findings.
- Confirmed that the only local environment files are the root development and production files. Both remain ignored by Git; no example environment files are present. The app configuration exposes only `EXPO_PUBLIC_*` values.
- Refreshed the root, mobile, broker, simulator, end-to-end, and documentation-index readmes to match the current implementation and verification limits. The older dated progress checkpoints below are retained as history.
- Verification on this cleanup tree: workspace build and typecheck pass; ESLint passes with mobile coverage; Prettier format/check passes after applying the formatter; Knip reports no unused files, exports, dependencies, or unlisted dependencies with the readiness generator included; schema generation check, Expo public config, and readiness-registry freshness check pass.
- Root Jest on the cleaned tree: 34 suites and 505 tests pass; the 2 PostgreSQL integration suites (48 tests) are skipped because this run had no integration database configured. Mobile Jest passes all 50 suites and 470 tests when run serially. The initial parallel run timed out in two long UI journey tests under concurrent full-repository checks; both passed on the isolated serial rerun.
- Updated mobile measurement UI tests to use Testing Library's current `findBy*` timeout argument position after the suite reported its deprecation warning. Production behavior is unchanged by this test-only adjustment.

## UI accessibility pass (2026-10-26)

- On `dev`, raised previously undersized shared and screen controls to the 48 dp target across Home, Assistant, Capture, Simulator, Profile, translation controls, the global shell, and readiness disclosures. The web font token now uses the loaded Plus Jakarta Sans family with the Telugu fallback.
- Reviewed Home, Capture, Assistant, and Virtual Glasses in the local Expo web build. Browser rendering is the only visual evidence from this pass; no device or assistive-technology run was made.
- Validation and independent review status for this change are recorded in `blocker.txt` under BLOCKER-011.

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

- Root: 291 tests passed, including 10 PostgreSQL integration tests. Mobile: 50 passed. Coverage thresholds met. (Dated figures; superseded by the 2026-10-24 later totals below.)
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
- Not done at the time: no enrolment screen was wired in the UI. Superseded: the enrolment screen is built and tested in the later change set listed below. No device run was made.
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

### BLOCKER-006 continuity, rate-limit and gate fixes after the re-review (2026-10-24)

Fresh-context re-review of 19c3ce2 and the prior fixes: APPROVE WITH CONDITIONS, no high finding. Handling of its findings:

| #   | Severity       | Finding                                                                                            | Handling                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium         | Continuity checked only at start-up; an owner-role session could lower spend while the broker ran. | Fixed. `AnchoredBudgetStore.reserve` compares recorded spend with the anchored value for the month and halts when it is lower. Test added.                                                                                                                                                                                                                                                                  |
| 2   | Medium         | Anchor location might not be writable, so a billed call would precede a failed anchor write.       | Fixed. `probeAnchor` runs before the broker listens. The Dockerfile creates `/var/lib/broker-anchor` owned by the runtime user. Probe tests added.                                                                                                                                                                                                                                                          |
| 3   | Medium         | A restore brings back devices revoked after the backup.                                            | Fixed in the runbook. The restore section now requires re-running `admin-cli revoke` for each later revocation, and a check with `list-devices`.                                                                                                                                                                                                                                                            |
| 4   | Medium         | The application role could insert devices and edit reserved spend directly.                        | Fixed. Enrolment redeems through `broker_redeem_enrolment` (SECURITY DEFINER, owner-owned, EXECUTE to the application role only). The application role has no INSERT on `broker_device`. A deferred commit-time trigger requires `reserved_paise` to equal the sum of open reservations. Recorded spend is deliberately not covered, so the documented recovery can still raise it. PostgreSQL tests added. |
| 5   | Medium, latent | The mobile gate took its approval and acceptance from the caller.                                  | Fixed. `callBroker` reads the address, secure storage and the in-code approved-version constant (null). `callBrokerWithPolicy` is the tested core. Tests show no request is made while the disclosure is unapproved. The core package still exports the raw client; the app does not use it.                                                                                                                |
| 6   | Low            | The backup URL guard missed an unencoded `/` in a password.                                        | Fixed. The userinfo pattern is `://[^@]*:[^@]*@`.                                                                                                                                                                                                                                                                                                                                                           |
| 7   | Low            | The reaper refreshed only the current month.                                                       | Fixed. It refreshes the current and previous month.                                                                                                                                                                                                                                                                                                                                                         |
| 8   | Low            | A crash between settle and anchor write can lose one attempt on a rollback.                        | Residual, documented in the runbook.                                                                                                                                                                                                                                                                                                                                                                        |
| 9   | Low            | The mobile gate passed a never-aborted signal, so the gateway timeout was not applied.             | Fixed. The signal is passed through from the caller.                                                                                                                                                                                                                                                                                                                                                        |
| 10  | Low            | The per-client enrolment key was the full IPv6 address, so one /64 gave unlimited keys.            | Fixed. `enrolmentKey` keeps the first four IPv6 groups. Tests added. Eviction by insertion order is documented.                                                                                                                                                                                                                                                                                             |

Enrolment rate limiting: each client address has its own bucket (5 burst, then one per minute), with one global ceiling (60 burst, then one per 30 seconds). A refused client does not spend the global ceiling. Memory is bounded (`TokenBucket` maxKeys). Tests: abuse by one client does not lock out a legitimate client; 20 simultaneous requests from one client admit exactly the burst; the global ceiling caps spread-out guessing; a replay is refused and counted. Limits: the per-client key needs the reverse proxy to be configured with `BROKER_TRUST_PROXY_HOPS=1` (owner condition); without it every caller shares the proxy address.

Test evidence (2026-10-24, PostgreSQL 17 on a throwaway local instance): `pnpm test` with `BROKER_TEST_DATABASE_URL` set passed 29 of 29 root suites (360 tests) and 12 of 12 mobile suites (97 tests). Coverage gates passed. Typecheck, lint, format, knip, build, `check:expo` and `check:schema` passed. A local gitleaks binary is not installed, so the secret scan is run by CI; a local pattern scan of the diff found no secret-shaped strings.

Still open (owner or external): the reverse-proxy TLS, body and rate limits and `trustProxy` hop count; the Docker build and the compose stack (not run here); the disclosure text and version approval (owner decision (e)); live mode stays disabled; BLOCKER-006 remains OPEN.

### BLOCKER-006 and BLOCKER-008: review conditions, local Docker validation (2026-10-24)

- Independent review of 6b6ea5e (fresh context, read-only): APPROVE WITH CONDITIONS, no critical or high finding. Conditions and their fixes in this change set: backup guard refuses the libpq keyword form and any non-postgres URL (tested by running the real `lib.sh`); anchor writes serialised and fsynced, and the maximum taken after the read (concurrency test); enrolment label validated before redemption (test: a bad label is refused and the code stays usable).
- Also fixed from the same review: a closed reservation cannot change state, actual spend or close time (database trigger, PostgreSQL test); the verified spend is written to the anchor at start-up.
- Still open from that review: label-level gaps are closed; the state-transition guard covers the application role's reopen path; owner-trust residual (the owner role can disable triggers; the anchor catches spend lowering at the next reservation, reserved lowering does not). Start-up does not yet verify function bodies or grants; recorded as a residual.
- Local Docker validation (mock mode only; project `lensmate-broker-local`; no Hostinger, no provider call, no real key): see blocker.txt BLOCKER-006 for the step table. Other products' containers were recorded before and after and were not changed.
- Test evidence for this change set: `pnpm test` with PostgreSQL 17 on a throwaway instance: root 370 tests and mobile 98 tests passed; coverage gates passed; typecheck, lint, format, knip and build passed.
- BLOCKER-006 remains OPEN. Re-review of this change set is PENDING.

### BLOCKER-006: fresh-context re-review of 095c8c8 and fixes (2026-10-24)

Review (fresh context, read-only): APPROVE WITH CONDITIONS, no critical finding. Closed from the previous review: backup guard, anchor write queue and fsync, label validation before redemption, closed-reservation immutability (app and admin roles), verified spend anchored at start-up. Findings and handling in this change set:

| #   | Severity         | Finding                                                                                                                                                                      | Handling                                                                                                                                                                                                                                                            |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Medium           | An anchor with no months was accepted as a valid baseline, so a rolled-back ledger could overwrite it.                                                                       | Fixed. An anchor with no months is treated as absent. Test: a rolled-back ledger with an empty anchor is refused.                                                                                                                                                   |
| F2  | Medium           | With no anchor and an empty ledger, a restored empty backup started silently with no anchor.                                                                                 | Fixed. A first start needs the owner's `BROKER_LEDGER_GENESIS=yes`. Without it the broker refuses with `NO_ANCHOR`. The failure-path script sets the flag only for its first start.                                                                                 |
| F4  | Medium           | Search-path shadowing: a temporary table could shadow a ledger table for a session.                                                                                          | Fixed. Every database function pins `search_path = public, pg_temp`, and TEMP is revoked from PUBLIC at migration. Tests: the application role cannot create temporary tables; the grant is false.                                                                  |
| F5  | Medium           | A restore brought revoked devices back as active.                                                                                                                            | Fixed. Revocations are recorded on the anchor volume (the admin CLI mounts it). Startup refuses with `REVOCATION_ROLLED_BACK` if a recorded device is active or missing. Tests: unit tests for recording, preservation across spend writes and the startup refusal. |
| F6  | Low              | libpq parameters such as `sslpassword` could carry a secret in the URL.                                                                                                      | Fixed. Any query parameter whose name contains "pass" is refused. Test added.                                                                                                                                                                                       |
| F7  | Low              | IPv4-mapped IPv6 clients all shared one rate-limit bucket.                                                                                                                   | Fixed. They are keyed by their IPv4 address. Test added.                                                                                                                                                                                                            |
| F9  | Low              | The encryption key and the integrity key could be the same file.                                                                                                             | Fixed. Backup and restore refuse identical keys. Test added.                                                                                                                                                                                                        |
| F3  | Medium, residual | The application role is the broker runtime; a compromised broker process can alter reservation state and reserved spend within its own role. Spend itself cannot be lowered. | Accepted residual. A transactional check on settled actuals would need an owner-role recovery exception and was not built. Recorded here.                                                                                                                           |
| F8  | Low, residual    | `callBrokerWithPolicy` is exported, and `@lensmate/core` exports the raw client. The app does not call either path.                                                          | Accepted residual for now. A lint rule or package export restriction is the owner-approved follow-up.                                                                                                                                                               |
| F10 | Info             | Owner-role can disable triggers; startup verifies trigger names and enabled state, not function bodies.                                                                      | Residual, owner-trust.                                                                                                                                                                                                                                              |

Test evidence: `pnpm test` with PostgreSQL 17 on a throwaway instance: 434 root tests and 100 mobile tests passed. Coverage gates passed. Lint, typecheck, format, knip, build, `check:expo` and `check:schema` passed.

Still open: re-review of this change set (PENDING); the Docker failure-path suite must be re-run against the committed head because it builds from git; live mode stays disabled; BLOCKER-006 remains OPEN.

### BLOCKER-006 and BLOCKER-008: second fresh-context re-review of 58c6ec0 (2026-10-24)

Verdict: APPROVE WITH CONDITIONS. Conditions and their handling in the following commit:

| Finding                                                                                     | Handling                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Revoking in SQL, or with the anchor unmounted, could leave a revocation unrecorded (F1, F2) | The anchor directory is checked before a revocation is recorded. At start-up every revocation the database shows that the anchor lacks is recorded (`syncRevocations`). The runbook says to restart the broker after a manual revocation. Residual: the window between an SQL revocation and the next start. |
| Admin role may write revoked_at directly (F1)                                               | Kept, because the admin CLI needs it. The start-up sync closes the gap after one start. Documented.                                                                                                                                                                                                          |
| Backup key check did not match what openssl reads (F3)                                      | Fixed. Files sharing the first line, or the same content without whitespace, are refused. Test added.                                                                                                                                                                                                        |
| Marker recorded before the first anchor write (F5)                                          | Fixed. The genesis is recorded after the first anchor write, so a failed anchor write cannot leave a stuck marker.                                                                                                                                                                                           |
| Ledgers started before the marker had no protection (F6)                                    | Fixed. Migration marks any database with budget rows as started. The PostgreSQL genesis test accepts the backfill; the backfill itself is not separately tested.                                                                                                                                             |
| Operators not warned about the genesis flag (F4)                                            | Runbook section added.                                                                                                                                                                                                                                                                                       |

Not verified in this pass: a live restore of a pre-genesis backup; the backfill as a separate test; the failure-path Docker suite on this commit (to be re-run after push).

### Checkpoint: P-1 voice-session controls, demonstration and matrices (2026-10-24)

- Commits on dev (CI green on each head): `8f84fa8` voice commands, silence timer and translation screen (core and simulator tests at 100 percent branch coverage for the session and timer code); `b717692` FEATURE_MATRIX.md and reconciled GAP_MATRIX.md; `2da2240` manual Android emulator and Maestro configuration (not run; manual trigger only, runner minutes owner-gated); `034f6da` second re-review conditions for the broker (genesis after the first anchor write, revocation sync, first-line key check, migration backfill); `a0dae92` interactive SEE–HEAR–TALK demonstration.
- The demonstration is reachable from the home screen ("Try the demo") and at /demo on the web preview. Verified in the browser on the preview server: choose a synthetic scene, take a simulated photo, ask a synthetic question, read the mock-labelled answer, and see the event-log summary (1 photo, 1 question, 1 answer). Synthetic scenes, transcripts, mock answers and simulated times are labelled in the UI.
- Not real: no AI, no speech, no camera, no microphone, no provider. Cloud disclosure is not approved, so the demo makes no network calls and the broker path stays blocked.
- BLOCKER-006 and BLOCKER-008 remain OPEN; the re-review of 034f6da is pending. The Docker failure-path suite is being re-run on 034f6da.

### Docker failure-path verification on 4ad5fc1 (2026-10-24)

- 14 of 14 scenarios PASS on the committed head (`git archive HEAD`, mock mode, placeholder secrets, project removed afterwards). Non-project containers unchanged (15 entries before and after).
- A first re-run on 034f6da failed seven scenarios. Root cause: `verifySchema` read columns from `information_schema.columns`, which lists only columns the current role may use. The broker runs the check as the application role, which has no rights on the new genesis table, so the table looked empty and the broker refused to start. The local PostgreSQL tests run as the owner and did not show it. Fix: read `pg_attribute` (commit 4ad5fc1). Regression test added: the guard runs as the application role.
- Lesson recorded: schema checks must run with the least privilege the broker uses, and the Docker suite is the only place that exercises that path end to end.
- Broker unit and PostgreSQL tests on 4ad5fc1: 185 of 185 passed. Lint of services/broker passed.
- Fresh-context re-review of 034f6da and 4ad5fc1: requested; result to be recorded when it returns. BLOCKER-006 and BLOCKER-008 remain OPEN until that review is complete.

## Checkpoint 2026-10-24 (after f4caa63)

Scope: independent self-review of the AI, vision, translation, agent, automation, memory and backup code; fixes; tests for
failure paths; decision records; dependency advisory check. Broker stayed in mock mode by default. No Hostinger deploy,
no change to main, no waiver.

Evidence (local, this checkpoint):

- Gates: format, knip, lint, build, mobile typecheck, schema, Expo config and tests all exit 0.
- Tests: broker and core 523 passed (35 suites); mobile 259 passed (25 suites). New in this checkpoint: 2 broker backup
  tests (revoked device refused; new device cannot read the replaced device's backup), 2 session-timing tests, plus the
  notes-matching and enrolment-removal tests from f4caa63 follow-up.
- Dependency audit (pnpm audit, high): zod advisory resolved by override to 4.6.7. node-forge advisory open: no patched
  release on the registry.
- Live (owner-approved dev key): translation, assistant, agents (planner, memory keeper, writer), live research (:online),
  vision (one test image), notes Q&A, encrypted backup upload, wrong-passphrase refusal, restore, automation run, device
  enrolment, revocation refusal, removal and re-enrolment, usage meter. Ledger: 13 settled reservations, 253 paise.
- Browser (mock and live): all 13 screens load with no console errors; microphone calls: zero during tab navigation.

Not verified: native speech and speech output on devices, native encrypted storage, camera capture, photo upload, the
translation announcement audio on a device, Telugu and Hindi voice quality, interruption timing, and all device
measurements. Matrices (FEATURE_MATRIX.md, GAP_MATRIX.md) were not fully reconciled in this checkpoint; the review and
decisions above are the current source.

## Round 2026-10-24 (directive P0): baseline recovery and navigation

- Baseline: dev head before this round was b314c26. Its GitHub CI run failed at the format check on the checkpoint
  Markdown files. Fixed in 1132662 (format only). Prior run f4caa63 passed CI.
- Demo "Back to home" now navigates to the home route explicitly (`src/navigation.ts`, unit tested). Before, it went
  back in history when it could, so the result depended on the path taken. Browser check: home, demo, back to home
  (exact route `/`); direct load of `/demo`, back to home (exact route `/`).
- `APP_SCREEN_MATRIX.md` created from the real routes. Interview practice and tasks/automations are marked as built
  ahead of their phase, and are not counted as current-phase work.
- Not done in this round: the directive's native speech, native storage, premium visual redesign, advanced vision,
  live research expansion, multi-agent, mobile actions, proactive automation and desktop interfaces. Each needs an owner
  decision, a device build, or a later phase under the Goal (sections 2A.3, 8 and 9). See blocker.txt.

## Round 2026-10-24 (owner approvals batch)

- Native speech output (expo-speech 58.0.3) is wired. Unit tests only; not run on a phone.
- Encrypted native memory (expo-sqlite 58.0.13 with SQLCipher, key in secure storage). The store refuses to write unless
  SQLCipher is active, reports a lost key without overwriting it, and deletes the file and key together. Unit tests with
  a fake keyed database only. Not verified on a phone.
- Interview practice and agents and automations are switched off by default and gated in the UI.
- Not built: native speech input (waits for on-device verification), native camera and photo integration, premium
  visual design system, advanced OCR. Each is listed in blocker.txt.
- EAS development build: see the result recorded in blocker.txt under this round.

- Commits: b02a98b (feature), fa2ca86 (format fix). CI on fa2ca86 passed after one re-run (the first run was cancelled
  by GitHub at the database job).
- EAS: one Android development build finished (56ae896b, commit b02a98b). Not installed or run. Expo created an Android
  keystore during the build; the owner should review it. See blocker.txt.

## Round 2026-10-24 (free iPhone testing route)

- Web export works again (expo-sqlite web stub). Single-page output kept: static output dropped the bundle script and
  the app could not respond, so it was reverted.
- PWA: manifest, icons, runtime Home Screen tags, update prompt, offline banner, service worker with a strict cache
  policy (tests load the real public/sw.js). Desktop Chrome verified; iPhone Safari not verified.
- Native speech input: expo-speech-recognition 58.0.0 added and wired behind a disabled flag. 15 mocked tests.
- Shell: top and bottom safe-area spacers (native measured insets, web env() values).
- Not verified: anything on an iPhone. No Mac or Xcode here, so no iPhone build was attempted.

## Round 2026-10-25 (Expo Go compatibility)

Expo Go compatibility, as built. "Bundle" means the iOS bundle compiles. "Device" means a phone run; none done yet.

| Feature                       | Expo Go                                      | Status                                                        |
| ----------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| Home, navigation, screens     | Yes (JS only)                                | Bundle compiles; device not run                               |
| SEE: camera preview and photo | Yes (expo-camera)                            | Bundle; device not run                                        |
| SEE: photo library            | Yes (expo-image-picker)                      | Bundle; device not run                                        |
| TALK: speech output           | Yes (expo-speech)                            | Bundle; device not run                                        |
| HEAR: speech input            | No (custom native module)                    | Shows "not available"; needs development build and owner flag |
| Translation (text)            | Yes; broker needed                           | Mock by default; no billable calls                            |
| Notes and memory              | No: encrypted SQLite needs development build | Refuses and says so; no plain-text writes                     |
| Local notifications and test  | Yes (expo-notifications)                     | Bundle; arrival and tap not verified                          |
| Simulator                     | Yes (JS only)                                | Bundle; device not run                                        |
| Credentials (SecureStore)     | Yes                                          | Unchanged                                                     |
| Broker (AI)                   | Needs network and LAN base URL               | Mock by default                                               |

## Round 2026-10-25 (end-to-end milestone)

- Added: SEE session state machine and integrated mock-mode tests; notification lifecycle tests; the iPhone HTTPS route decision
  record (docs/decisions/0003-iphone-broker-https-route.md).
- Verified here: gates, tests, the iOS bundle, and the Expo dependency check. Not verified here: anything on a phone.

## Round 2026-10-25 (session wiring and diagnostics)

- Capture screen runs on the SEE session module; diagnostics screen added; Expo Go bundle compiles.
- Not verified here: the wired screen on an iPhone. Owner run pending.

## Integration cycle on dev (dev head, 2026-10-25)

Evidence level for everything in this section: simulator, MOCK, or hosted CI on Linux runners. No real-phone, emulator, bench or device result exists in this cycle. The matrices (FEATURE_MATRIX, GAP_MATRIX, TEST_MATRIX) are unchanged: no row has direct evidence beyond simulator or MOCK.

### Integrated worker work, by requirement ID

The commit messages carry no requirement IDs. The mapping below is read from the matrix text. Partial means the work touches the row but does not complete it.

- F1 (vision help): Live Vision wired into the camera screen, with a mock-mode controller that sends bounded periodic frames. Partial. The matrix has no Live Vision row of its own.
- F3 (spoken answers): assistant requests cancel on Stop, and stale results are dropped. Decision 0004 records what cannot be refunded. Partial.
- F26 (barge-in) and session and gesture rules: simulator tests for speech precedence (press to stop speech) and for cutoff precedence. Tests only.
- F40 (indicator): simulator gesture tests confirm the indicator state through cutoff. Tests only.
- CL17 (no hidden capture): camera and photo-library import guard, covering dynamic import, require and picker calls, limited to the capture module. Partial.
- CL18 (auto-delete and export): temporary retention now fails closed, and log redaction covers whole secret values. Partial.
- CL19 (spend cap): cumulative development-test cap; paid calls are off by default; every paid call is charged to both the monthly and the development-test caps. Mock provider behaviour is tested. MOCK level.
- Maestro journeys (P-1): three flow files were added this cycle (flows C to E); e2e/maestro holds five in total. The flows are NOT RUN (see below). They map to F40 (privacy indicator session), F1 and F4 (virtual glasses capture and ask), and no matrix row (onboarding to assistant).
- No matrix row: assistant and profile UI redesign, the readiness tracker, simulator labels, broker backup-guard and rate-limit test changes, and the mobile test-stability fix (the first render of two screen test files now loads its React Native components before the first timed test).

### Test, CI and audit evidence

- CI run 40178590537 on the dev head: completed, success. Jobs: secret-scan success, quality success, broker-integration success.
- Full apps/mobile suite, CI quality job on the dev head (run 40178590537): 50 of 50 suites and 470 of 470 tests passed. Local runs on a byte-identical tree (three runs, recorded by the author session, not attached) also showed 50 of 50 and 470 of 470. They are not CI evidence.
- Broker PostgreSQL integration, from the CI broker-integration job on the dev head: 2 of 2 suites, 48 of 48 tests. postgres-budget 18 and security 30. The broker tree is the same as the earlier PostgreSQL run's tree, because the change since that run touches only two mobile test files. The authentication 3 and enrolment 10 split is the orchestrator's grouping. It was not reproduced from the test names, because the security suite has no describe blocks.
- Simulator (tools/simulator), run on the dev-head tree: 3 of 3 suites and 58 of 58 tests.
- `pnpm audit --audit-level=high`: one high finding, node-forge, reached through the Expo CLI in apps/mobile. Owner decision BLOCKER-010 is open and not waived. The agent has not waived it.
- Maestro flows (e2e/maestro): NOT RUN. Emulator and simulator jobs are blocked on BLOCKER-009.
- Agy audit: not delivered. The agy investigation note was removed in the cleanup round because it recorded owner-machine details; it was never an audit.

### Still open

- BLOCKER-010 (node-forge, high): owner decision required.
- BLOCKER-009 (emulator and simulator job capacity): owner check required before the Maestro flows can run.
- All real-phone, device, provider and live-AI behaviour: not verified in this cycle.

Validation for the UI pass: monorepo typecheck/build, repository lint, and Prettier check passed. Mobile Jest: 50 suites and 470 tests passed. Jest printed existing `findBy*` timeout-option deprecation warnings. Independent review remains pending (BLOCKER-011); device and assistive-technology checks were not run.

GitHub Actions push run 40232952151 passed `quality`, `secret-scan`, and `broker-integration` on `dev`.
