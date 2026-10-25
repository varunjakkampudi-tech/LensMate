# Broker local test failures

Investigation date: 2026-10-25

## `backup-guard.test.ts`

The failure reproduced before the test-only change: 1 failed, 6 passed. The failing case was `accepts a password-free postgres URL`.

On Windows, `spawnSync("bash")` resolved to `C:\WINDOWS\system32\bash.exe`, the WSL launcher. It exited with status 1 because it could not start `/bin/bash` (`execvpe(/bin/bash) failed: No such file or directory`). The test helper treated every nonzero status as an expected password rejection, so the shell startup failure made a safe URL look rejected. This is a test-environment issue, not a PostgreSQL or broker defect.

The test now selects Git for Windows Bash when running on Windows, checks that the selected shell starts, and counts only exit status 1 as a guard refusal. Other exit statuses raise diagnostics. Existing rejection, safe URL, and key-separation assertions remain active.

## `server.test.ts`

The server failure is machine-load sensitive. Before changing the test, a standalone run passed 50/50, but the full parallel Jest phase timed out in `caps total guessing across many clients with the global ceiling` after its 5-second limit. That test sent 60 local HTTP requests serially. A targeted rerun also timed out under the same loaded machine. The full run additionally timed out in an unrelated backup test, indicating general test-run contention.

The global-ceiling test now sends the same 12 clients x 5 attempts concurrently. `TokenBucket.take()` updates its state synchronously and the injected test clock is fixed, so this preserves the intended check: all 60 fit the per-client bursts and global ceiling, while attempt 61 is rejected globally. The targeted test passes, and the full parallel Jest phase now passes 34 suites / 499 tests (2 PostgreSQL suites skipped).

The suite's harness uses `InMemoryBudgetStore` and `MockProvider`. Its OpenRouter privacy test supplies a fake `fetchImpl`, so it makes no provider request and opens no database connection. No broker, provider, or database environment variable was present during inspection; those relevant variables were also unset for the test runs. Missing local PostgreSQL does not explain the server timeout.

The Copilot failure details are still pending. The same server test's timeout is now independently reproduced under full parallel load, but the Copilot report's exact failing assertion and relationship to this timeout remain open until its test name and trace arrive.

## Evidence

- Before the correction: `corepack pnpm exec jest services/broker/src/backup-guard.test.ts --runInBand` — 1 failed, 6 passed.
- Before the server test adjustment: `corepack pnpm exec jest services/broker/src/server.test.ts --runInBand` — 1 suite passed, 50 tests passed.
- Before the server test adjustment: full parallel Jest — 2 failed suites, 32 passed, 2 skipped; 497 tests passed and 48 skipped. `server.test.ts` timed out in its serial global-ceiling case; unrelated `backup.test.ts` also timed out.
- The adjusted global-ceiling case passed alone (1 selected test passed) and under full parallel Jest.
- Shell check: default `bash` resolved to `C:\WINDOWS\system32\bash.exe` and exited 1 with `execvpe(/bin/bash) failed: No such file or directory`; `C:\Program Files\Git\bin\bash.exe -c 'exit 0'` exited 0.
- After the correction: `corepack pnpm exec jest services/broker/src/backup-guard.test.ts services/broker/src/server.test.ts --runInBand` — 2 suites passed, 57 tests passed.
- After both test adjustments: full parallel Jest — 34 suites passed, 2 PostgreSQL suites skipped; 499 tests passed, 48 skipped.
- Exact `pnpm test`: build passed and the full Jest phase passed with the counts above; the subsequent mobile Jest phase failed in `translation-session-screen.test.tsx` (18 failures, 439 passed). No broker test failed.
- PostgreSQL integration tests were not part of these focused runs; no PostgreSQL service or credentials were used.
- The orchestrator reports CI on `origin/dev` is green; that hosted CI result was not independently queried during this investigation.
