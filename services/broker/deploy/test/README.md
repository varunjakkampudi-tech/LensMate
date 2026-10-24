# Broker failure-path tests (BLOCKER-006)

`failure-paths.sh` runs the broker stack in Docker in mock mode and checks the failure paths listed below. It is a
POSIX shell script. Run it from the repository root:

```sh
sh services/broker/deploy/test/failure-paths.sh
```

Set `FAILTEST_IMAGE=<tag>` to test an existing image instead of building one.

## What it does

1. Refuses to run if `OPENROUTER_API_KEY` is set, if any container or volume with the project name
   `lensmate-broker-failtest` exists, or if Docker is not reachable. Prints the containers that are not part of the
   project before the run.
2. Exports the committed tree (`git archive HEAD`) to a temporary directory, so the build sees LF line endings even on a
   Windows checkout. Builds the image from the repository root, unless `FAILTEST_IMAGE` is set.
3. Writes placeholder secrets and a compose override into the temporary directory. The override sets absolute secret
   paths, removes the host port publication, and sets the image tag. Nothing is written into the repository.
4. Runs the scenarios below, prints a result table, tears down only its own project (`down -v`, removes its
   containers), deletes the temporary directory and compares the non-project container list with the list taken at the
   start.

Exit status: `0` all PASS, `1` a FAIL or a changed container list, `2` a precondition stopped the run.

## Test environment

- The stack has no published host port. Health and requests run inside the broker container (`wget`, `node`).
- Database tools (`pg_dump`, `pg_restore`, `psql`) run inside the project's `postgres` container through small shims
  placed first on `PATH` for the backup and restore scripts. The backup test uses a read-only `broker_backup` role
  created for the test over the local socket. The restore test uses the owner role.
- The backup and restore scripts run on the host with its `openssl` and `node`. The key files are passed as Windows
  paths on Windows, because OpenSSL `file:` paths need them.
- On Windows the key-file mode check in `backup/lib.sh` always refuses (NTFS reports 644). The test runs a scratch copy
  of `backup/` with only that one line removed, as the runbook documents. On Linux the original scripts run unchanged.
  The committed scripts keep the check.
- Device enrolment uses the one-off admin CLI (`docker-compose.admin.yml`) and `POST /v1/enrol`. The device credential
  is kept in the temporary directory and never printed.

## Scenario expectations

| ID         | Scenario                           | Action                                                                       | Expected result                                                                     |
| ---------- | ---------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| a          | Missing anchor with existing spend | Insert spend 300 for the current month, no anchor file, start the broker     | Exit non-zero; message `AnchorError: NO_ANCHOR_WITH_SPEND`                          |
| b          | Corrupt anchor                     | Write `{not json` to the anchor file, start                                  | Exit non-zero; `AnchorError: ANCHOR_INVALID`                                        |
| c          | Unreadable anchor                  | Replace the anchor file with a directory, start                              | Exit non-zero; `AnchorError: ANCHOR_UNREADABLE`                                     |
| d-setup    | Valid anchor at 500                | Clean start, record spend 500, restart                                       | Anchor file holds the current month at 500; both starts succeed; clean stop exits 0 |
| d          | Rollback prevention                | TRUNCATE the ledger, insert spend 100 (anchor still 500), start              | Exit non-zero; `AnchorError: ROLLED_BACK`                                           |
| d-recovery | Documented recovery                | Owner raises spend to 500, start                                             | Broker starts; `/healthz` returns `{"status":"ok"}`                                 |
| e1         | Backup output                      | Run `backup.sh`                                                              | Exit 0; ciphertext with OpenSSL `Salted__` header; 64-hex HMAC tag file             |
| e2         | Wrong confirmation                 | Restore with a confirmation that is not the target name                      | Exit non-zero; `confirmation does not match`                                        |
| e3         | Non-empty target                   | Restore into the live `broker` database                                      | Exit non-zero; `already holds ledger tables`                                        |
| e4         | Tampered file                      | Flip one ciphertext byte, restore into a database that does not exist yet    | Exit non-zero; `integrity check failed` (no database step reached)                  |
| e5         | Empty target                       | Create `broker_restore_check`, restore                                       | Exit 0; restored spend and device count equal the source                            |
| g          | Restart after clean shutdown       | Stop (SIGTERM), start again with the same anchor                             | Stop exit code 0; restart; `/healthz` 200                                           |
| f1         | Anchor write fails                 | Replace the anchor file with a directory, send one chat request in mock mode | HTTP 503 `LEDGER_UNAVAILABLE`; the request is not answered                          |
| f2         | Ledger halted                      | Send another chat request                                                    | HTTP 503 `LEDGER_UNAVAILABLE`                                                       |

The control chat request before the fault must return HTTP 200. If it does not, f1 and f2 are reported NOT RUN with
the reason.

## Notes

- Scenario d needs the anchor to start at 0 and rise to 500. The first clean start creates the anchor file.
- The ledger is reset with `TRUNCATE ... CASCADE` between scenarios. It is the owner role's only way to lower recorded
  spend in a test, and it bypasses the row trigger on purpose. It stands in for a restore from an old backup.
- The run leaves no containers or volumes behind; a second run needs no manual cleanup.
