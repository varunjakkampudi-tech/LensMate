# Risk exceptions

Each entry is a written, dated acceptance of a risk the owner has chosen to carry. Entries expire. An expired entry
blocks the build until it is renewed or the issue is fixed.

## RE-001: node-forge RSA signature advisory (GHSA-86w9-cpqp-85rv)

- Severity: high. No patched version exists on the npm registry (newest node-forge is 1.4.0).
- Reach: build and development tooling only, through the Expo command-line tool. Not bundled into the phone app or the
  broker runtime. Exploiting it needs an attacker-controlled RSA signature that the tooling verifies.
- Decision (owner accepted the risk on 2026-10-26): accept the risk. The audit gate blocks every other
  high or critical advisory. This one is excluded by name: `pnpm audit:high` passes `--ignore GHSA-86w9-cpqp-85rv`.
- Re-check date: 2026-11-30. Expiry: 2026-12-31. At either point, re-check the npm registry for a patched node-forge,
  and remove the exclusion when one exists.
- Approver: owner, 2026-10-26. Recheck and expiry dates above remain in force.
