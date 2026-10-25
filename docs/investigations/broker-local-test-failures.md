# Broker local test failures

Investigation date: 2026-10-25

## `backup-guard.test.ts`

The failure reproduced before the test-only change: 1 failed, 6 passed. The failing case was `accepts a password-free postgres URL`.

On Windows, `spawnSync("bash")` resolved to `C:\WINDOWS\system32\bash.exe`, the WSL launcher. It exited with status 1 because it could not start `/bin/bash` (`execvpe(/bin/bash) failed: No such file or directory`). The test helper treated every nonzero status as an expected password rejection, so the shell startup failure made a safe URL look rejected. This is a test-environment issue, not a PostgreSQL or broker defect.

The test now selects Git for Windows Bash when running on Windows, checks that the selected shell starts, and counts only exit status 1 as a guard refusal. Other exit statuses raise diagnostics. Existing rejection, safe URL, and key-separation assertions remain active.

## `server.test.ts`

The Copilot failure could not be reproduced. The standalone run passed 50/50, and the combined rerun with the backup guard suite passed 57/57.

The suite's harness uses `InMemoryBudgetStore` and `MockProvider`. Its OpenRouter privacy test supplies a fake `fetchImpl`, so it makes no provider request and opens no database connection. No broker, provider, or database environment variable was present during inspection; those relevant variables were also unset for the test runs. Missing local PostgreSQL does not explain this suite. The exact failed test name and output from Copilot were requested but not available, so the cause of that specific report remains unverified.

## Evidence

- Before the correction: `corepack pnpm exec jest services/broker/src/backup-guard.test.ts --runInBand` — 1 failed, 6 passed.
- Before the correction: `corepack pnpm exec jest services/broker/src/server.test.ts --runInBand` — 1 suite passed, 50 tests passed.
- Shell check: default `bash` resolved to `C:\WINDOWS\system32\bash.exe` and exited 1 with `execvpe(/bin/bash) failed: No such file or directory`; `C:\Program Files\Git\bin\bash.exe -c 'exit 0'` exited 0.
- After the correction: `corepack pnpm exec jest services/broker/src/backup-guard.test.ts services/broker/src/server.test.ts --runInBand` — 2 suites passed, 57 tests passed.
- PostgreSQL integration tests were not part of these focused runs; no PostgreSQL service or credentials were used.
- The orchestrator reports CI on `origin/dev` is green; that hosted CI result was not independently queried during this investigation.
