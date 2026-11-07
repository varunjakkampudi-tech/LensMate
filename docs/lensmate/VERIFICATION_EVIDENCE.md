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
- review: CHANGES_REQUESTED
- implementation: `packages/core/src/device-lock.ts` (exported from `packages/core/src/index.ts`)
- tests: `packages/core/src/device-lock.test.ts` (19 tests covering acceptance criteria 1–15 in ACCEPTANCE.md; no network)
- local checks after the CR-23 fix: `jest packages/core` → 13 suites / 173 tests passed; eslint and tsc clean; prettier clean on changed files.
- audit: broker per-device credentials, revocation and enrolment exist in services/broker/src/devices.ts; the device lock and audit of lock events were absent (see ACCEPTANCE.md).
- unverified: owner command signature scheme and key distribution (platform adapter), delivery of commands to glasses or phone, wiping secrets after REVOKE, server-side revocation audit storage (follow-up), and physical lock behaviour (BLK-001).
