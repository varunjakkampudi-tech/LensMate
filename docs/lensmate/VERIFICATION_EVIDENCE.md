# LensMate Verification Evidence

Each entry records: item ID, commit SHA, commands, exact results, and what remains unverified. Simulation results never mark hardware items as PASS.

## B16 — Offline command router

- Implementation: `packages/core/src/offline-command-router.ts`
- Tests: `packages/core/src/offline-command-router.test.ts` (16 tests)
- Acceptance criteria: `docs/lensmate/ACCEPTANCE.md` (B16 table, 12 criteria)
- Commit SHA: recorded in OVERNIGHT_REPORT.md after the commit is made (the report cannot contain its own commit SHA).

Commands and results (run from repo root, 2026-11-06):

- `npx jest packages/core packages/protocol` → 13 suites passed, 96 tests passed (includes the 16 B16 tests).
- `npx tsc -p packages/core/tsconfig.json --noEmit` → no errors.
- `npx tsc -p packages/protocol/tsconfig.json --noEmit` → no errors.
- `npx eslint packages/core scripts/lensmate` → no errors.
- `npx prettier --check packages/core/src scripts/lensmate` → formatted.
- `npx knip` → no unused-file findings after the validator was wired into `package.json` (`check:tracking`).
- `node scripts/lensmate/validate-tracking.mjs` → see OVERNIGHT_REPORT.md for the final run output.

Unverified for B16:

- Running on real glasses firmware or the glasses Bluetooth link (BLK-001).
- Wake-word capture and speech recognition feeding the router (not in this item).
- The real phone-disconnect path: the router has no link input, so this is by design, not tested on hardware.
- Command table is the router's own; no production commands beyond the test fixtures are defined yet.

Independent review: NOT_REQUESTED. Not yet submitted to ChatGPT.

## Earlier entries

- Commit 7c0c2fd (tracking docs only). No checklist item verified. Independent review by ChatGPT: CHANGES_REQUESTED (CR-01 to CR-05), addressed in the next commit.
