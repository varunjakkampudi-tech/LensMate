# LensMate Verification Evidence

Each item with verification PASS or review APPROVED must have a section headed `## <ID> ...` containing:

- `- commit: <sha>` — the commit that contains the implementation
- `- verification: <PASS|PARTIAL|...>` — must match MASTER_CHECKLIST.md
- `- review: <NOT_REQUESTED|PENDING|APPROVED|CHANGES_REQUESTED>` — must match MASTER_CHECKLIST.md
- `- tests: <commands and results>`
- `- unverified: <what remains unverified>`

`pnpm check:tracking` enforces this structure. Simulation results never mark hardware items as PASS.

## B16 — Offline command router

- commit: 944f550d53fe85025dee57b19d5336a44122d994
- verification: PASS
- review: APPROVED
- independent review: ChatGPT "LensMate B16 — Final Independent Review", reviewed HEAD ddd7cf2, exact-commit CI run 42255815340 (quality, broker-integration, secret-scan all passed). Approval covers the software component only; hardware validation stays PENDING.
- implementation: `packages/core/src/offline-command-router.ts`
- tests: `packages/core/src/offline-command-router.test.ts` (25 tests: cancellation-lifecycle regressions for CR-06 and trusted-policy authorization regressions)
- acceptance criteria: `docs/lensmate/ACCEPTANCE.md` (12 criteria, plus lifecycle criteria added for CR-06)
- commands run (repo root): `npx jest packages/core packages/protocol` → 13 suites, 105 tests passed; `npx tsc -p packages/core/tsconfig.json --noEmit` and the protocol equivalent → no errors; `npx eslint packages/core scripts/lensmate` → no errors.
- unverified: running on real glasses firmware or the Bluetooth link (BLK-001); wake-word capture and speech recognition feeding the router; a real phone-disconnect path (the router has no link input, so this is by design only); production command tables (only test fixtures exist).

## Earlier entries

- Commit 7c0c2fd (tracking docs only). No checklist item verified. ChatGPT review: CHANGES REQUESTED (CR-01 to CR-05).
- Commit e082d56 (B16 first version, tracking CR-01 to CR-05). ChatGPT review: CHANGES REQUESTED (CR-06 cancellation race; CR-07 stronger validator/evidence; CR-08 report wording).

## B17 — Local queue and deferred synchronization

- commit: c6e9fb1dc106265b2f30fe1de7d5a952713f588b
- verification: PASS
- review: APPROVED
- fix commit: 95ed6f3 (CR-10, CR-11, CR-12 from ChatGPT review of c6e9fb1; criteria 16–18 in ACCEPTANCE.md)
- implementation: `packages/core/src/offline-sync-queue.ts`
- tests: `packages/core/src/offline-sync-queue.test.ts` (19 tests covering acceptance criteria 1–18 in ACCEPTANCE.md; real AES-256-GCM in tests only)
- local checks after the fix (95ed6f3): `jest packages/core` → 11 suites / 115 tests passed; eslint, prettier and tsc clean on the changed files; `pnpm check:tracking` OK. Hosted CI for 95ed6f3 is recorded in the review request, not here.
- commands run in a clean checkout of c6e9fb1 (`pnpm install --frozen-lockfile`): build, typecheck, lint, format:check, knip, check:schema, check:tracking, check:expo, audit:high all exit 0; `pnpm test` → 40 suites / 261 tests passed (core/protocol 14 suites / 120 tests in the working tree before this commit).
- unverified: real device storage (phone SQLite/keystore or on-glasses flash), production cipher per platform, real network sync to the broker, power-loss behaviour on hardware (BLK-001), and the hosted CI run for the evidence commit (recorded in the reply, not in this file).

## B19 — Network loss recovery and automatic reconnection

- commit: 6b03111fa945aec0edd029c636385cf9a85e6d06
- previous code commit: 39fd0e781b7411876309345a0bd2faab7d598430 (ChatGPT review: CHANGES_REQUIRED, CR-13, CR-14, CR-15)
- verification: PASS
- review: APPROVED
- non-blocking follow-up from review: make onCallbackError safe against its own exceptions (not yet changed; B19 approval is for the software controller only)
- implementation: `packages/core/src/network-recovery.ts` (exported from `packages/core/src/index.ts`)
- tests: `packages/core/src/network-recovery.test.ts` (19 tests covering acceptance criteria 1–14 in ACCEPTANCE.md; deterministic fake scheduler, injected random)
- commands run after the commit: `jest packages/core` → 12 suites / 127 tests passed; eslint and tsc clean on the changed files; `pnpm check:tracking` OK.
- audit: no existing reconnect or network-state module (glasses-link.ts and broker-client.ts have no reconnection); see ACCEPTANCE.md.
- unverified: real Wi-Fi or cellular behaviour, OS network-change events on phone or glasses, and broker integration. Hardware validation PENDING (BLK-001). Hosted CI for the evidence commit is recorded in the review request.

## B20 — Local clock and timestamp continuity

- commit: 661eb241e74ee7aea8e301d8c8396f427465b831
- previous code commit: 2c7ff200efd76de314fb4ea1358ab74f0fd48572 (ChatGPT review: CHANGES_REQUIRED, CR-16, CR-17, CR-18)
- formatting follow-up: 4fc02e1 (Prettier only)
- verification: PASS
- review: APPROVED
- implementation: `packages/core/src/local-clock.ts` (exported from `packages/core/src/index.ts`)
- tests: `packages/core/src/local-clock.test.ts` (20 tests covering acceptance criteria 1–14 in ACCEPTANCE.md; injected clock, no real time)
- local checks after the code commit: `jest packages/core` → 13 suites / 147 tests passed; eslint and tsc clean on the changed files; `pnpm check:tracking` OK.
- audit: no core clock abstraction existed; mobile and broker code call Date.now() directly (see ACCEPTANCE.md).
- unverified: real hardware clocks and RTC drift, cryptographic authentication of time sources (caller responsibility), NTP/GNSS integration, power-loss behaviour, and detection of restored older snapshots (BLK-001 for on-device work).

## B21 — Remote device lock and credential revocation

- commit: a1f6c88b177ec7a544891093c11206c826990565
- CR-23 fix commit: a1f6c88b177ec7a544891093c11206c826990565
- earlier fix commit: a1202e4 (CR-19..CR-22, reviewed at 56c5c0b)
- previous code commit: a4b9fe41c38a04d699fadaa590f69ecc8c961b9e (ChatGPT review: CHANGES_REQUIRED, CR-19, CR-20, CR-21, CR-22)
- follow-up test fix: 8410e54 (assertion count only)
- verification: PASS
- review: APPROVED
- implementation: `packages/core/src/device-lock.ts` (exported from `packages/core/src/index.ts`)
- tests: `packages/core/src/device-lock.test.ts` (19 tests covering acceptance criteria 1–15 in ACCEPTANCE.md; no network)
- local checks after the CR-23 fix: `jest packages/core` → 13 suites / 173 tests passed; eslint and tsc clean; prettier clean on changed files.
- audit: broker per-device credentials, revocation and enrolment exist in services/broker/src/devices.ts; the device lock and audit of lock events were absent (see ACCEPTANCE.md).
- unverified: owner command signature scheme and key distribution (platform adapter), delivery of commands to glasses or phone, wiping secrets after REVOKE, server-side revocation audit storage (follow-up), and physical lock behaviour (BLK-001).

## B22 — Factory reset and secure data erasure

- commit: 3b2f2c096d2c9c6e9814ddd62d4516949fe64e1b
- previous code commit: c1676bb345974ab37dcfd00113a2951ce8cb5497 (ChatGPT review: CHANGES_REQUIRED, CR-24, CR-25, CR-26)
- verification: PASS
- review: APPROVED
- implementation: `packages/core/src/factory-reset.ts` (exported from `packages/core/src/index.ts`)
- tests: `packages/core/src/factory-reset.test.ts` (16 tests covering acceptance criteria 1–13 in ACCEPTANCE.md; in-memory store, scripted step runner, trusted authorization stub)
- local checks after the fix: `jest packages/core` → 13 suites / 189 tests passed; eslint, tsc and prettier clean.
- audit: mobile vault deleteAll, native-store "delete everything" with secure_delete, backup deleteBackup, and broker device revocation exist; none is ordered, persisted, resumable or verified (see ACCEPTANCE.md).
- unverified: physical erasure on flash or secure element, key destruction in hardware, forensic recovery resistance, broker revocation endpoint, and on-device behaviour (BLK-001).

## B23 — Diagnostics and crash recovery

- commit: 60e011014e30922466529eb9356fab9cb5b6b133
- previous fix commit: e4912f5317eb6a73e8cd45508cad63a72ecd840d (ChatGPT review: CHANGES_REQUIRED, CR-30, CR-31)
- previous code commit: 4b344ce7d7379618a34ab7e76fa53081bc236854 (ChatGPT review: CHANGES_REQUIRED, CR-27, CR-28, CR-29)
- test-source commit: edc8a17 (runtime-built redaction sample)
- verification: PASS
- review: APPROVED
- implementation: `packages/core/src/diagnostics-recovery.ts` (exported from `packages/core/src/index.ts`)
- tests: `packages/core/src/diagnostics-recovery.test.ts` (20 tests covering acceptance criteria 1–15 in ACCEPTANCE.md; injected time, existing log allowlist, trusted verifier stub)
- local checks after the CR-30/CR-31 fix: `jest packages/core` → 13 suites / 209 tests passed; eslint and tsc clean on changed files; prettier clean.
- audit: log-redaction.ts (allowlist and redaction) and mobile diagnostics checks exist; crash classification, crash-loop safe mode, bounded diagnostic retention and recovery verification were absent (see ACCEPTANCE.md).
- unverified: native crash dumps and handlers on device, OS watchdog integration, remote diagnostics upload, and hardware-specific failure modes (BLK-001).

## B25 — Optional phone, PC and accessory pairing

- commit: 6f0aafd80d2b88b305ca74d63bb007e497c2d9df
- previous code commit: 1f0671ded459b5f46ca6fe3208bdcd8f5207117b (ChatGPT review: CHANGES_REQUIRED, CR-32, CR-33, CR-34)
- verification: PASS
- review: APPROVED
- implementation: `packages/core/src/pairing.ts` (exported from `packages/core/src/index.ts`)
- tests: `packages/core/src/pairing.test.ts` (18 tests covering acceptance criteria 1–13 in ACCEPTANCE.md; injected time, HMAC commitment stub, owner authorizer stub)
- local checks: `jest packages/core` → 13 suites / 227 tests passed; eslint and tsc clean on changed files; prettier clean.
- audit: glasses-link.ts is transport only; broker and phone enrolment cover the broker, not peer pairing (see ACCEPTANCE.md).
- unverified: Bluetooth or Wi-Fi pairing transport, code display and entry on glasses, cryptographic peer key exchange, PC and accessory protocols, and on-device behaviour (BLK-001). Peer authentication is the platform adapter responsibility.

## B26 — Direct pairing with the cloud account independently of a phone

- commit: 43c23000f878251849aba972b57b7f0b62441204
- previous code commits: ca7bcb15d6e7ea8429678993ab2cdab487af5f75 (CR-35, CR-36, CR-37); bb3cf6a7badffc3bba9fd43e391cbb9cd1c42b37 (CR-38, CR-39 on re-review HEAD 421875b)
- verification: PASS
- review: CHANGES_REQUESTED
- implementation: `packages/core/src/account-binding.ts` (exported from `packages/core/src/index.ts`)
- tests: `packages/core/src/account-binding.test.ts` (21 tests covering acceptance criteria 1–15 in ACCEPTANCE.md; injected time, HMAC commitment stub, owner authorizer stub; CR-38 and CR-39 recovery-invariant and epoch-scoping tests)
- local checks: `jest packages/core` → 248 tests passed; eslint, tsc and knip exit 0; prettier clean.
- audit: broker devices.ts enrolment (single-use, expiring, hashed codes) and B25 pairing exist; no device-to-account binding state existed in core (see ACCEPTANCE.md).
- unverified: the cloud account system and credentials, real network enrolment, the broker enrolment endpoint, account recovery by email or support, physical connectivity and hardware integration (BLK-001).
