# Current Status

## Feature Status

Features from `docs/product/feature-register.md` (F1 to F54):

- Fully complete / built features: none (0)
- Partly built features:
  - F1: Vision help: describe what is in front of you on request
  - F2: Read visible text aloud
  - F3: Voice questions and spoken answers, streaming
  - F4: Photo capture on button press, saved to phone
  - F5: Voice notes: dictate, save, retrieve
  - F6: Memory: save facts you choose, recall them
  - F8: Conversation summaries on request
  - F9: Translation of visible text into English, Telugu, Hindi
  - F11: Quick actions: last photo, last answer, repeat, stop
  - F13: Battery and health status on the phone app
  - F20: Live two-way translation of conversation
  - F21: Live captions of conversation on the phone
  - F22: Language auto-detect for English, Telugu, Hindi, and mixed speech
  - F23: Interview practice: mock questions by voice
  - F26: Voice stop, cancel and repeat
  - F33: Environment analysis on request
  - F35: Friendly voice persona with tone settings
  - F37: Conversation understanding during a session you start
  - F40: Status indicator visible to bystanders during capture and listening
  - F50: Accessibility assistance
  - F53: Device and AI health awareness
- Not started: F7, F10, F12, F14, F16, F24, F25, F27, F28, F29, F31, F32, F34, F36, F38, F39, F41, F42, F43, F44, F45, F46, F47, F48, F49, F51, F52, F54
- Excluded / Not planned: F15, F17, F18, F19, F30
- Physical device verification: none of the features is verified on a physical device.

## Test and CI Evidence

Evidence from `PROGRESS.md` (section "CI repair and reconciliation (2026-10-26)"):

- Worktree commit SHA: `fe1e606` (from `git rev-parse --short HEAD`)
- Recorded green CI commit: `6c74348` (CI run 40291616548)
- Test counts reported in `PROGRESS.md` for commit `6c74348`:
  - Root test run: 530 passed, 57 database tests skipped
  - Mobile Jest: 501 of 501 passed
  - Broker suites (with `BROKER_TEST_DATABASE_URL` against local PostgreSQL 17): 15 of 15 suites, 256 of 256 passed
  - Local gates: build, typecheck, lint, format check, knip, schema check, Expo public config, and `audit:high` all exit 0

## Blocked Items and Unblockers

- Owner:
  - Native speech enable (`NATIVE_LISTENING_ENABLED` flag requires owner approval and verified development build)
  - Apple Developer Program membership (`BLOCKER-001` required for iOS development and TestFlight builds)
  - Merge to main (production promotion requires explicit owner approval per git branch policy)
- Device:
  - Android and iPhone testing (physical phone verification for end-to-end journeys, audio, storage, and sensors)
- Hardware:
  - F12 wear detection (requires physical smart glasses hardware; skipped by owner for now)

## Source Audit Items (LM-A01 to LM-A17)

Status and open reasons from `blocker.txt` ("ROUND 2026-10-26 (source audit LM-A01 to LM-A17: what was fixed and what is still open)"):

- LM-A01 (native speech): Open — NATIVE_LISTENING_ENABLED stays false. Turning it on needs a development build verified on Android and iPhone, and owner approval.
- LM-A02 (cost bound): Fixed — reservation formula tested for every allowlisted model at largest allowed input and output (services/broker/src/pricing.test.ts); template allowance in pricing.ts shared with server.
- LM-A03 (Android end-to-end): Open — not run. The owner asked to skip Android emulator testing for now, and the workflow still needs its prerequisites.
- LM-A04 (automations on the phone and closed-app execution): Partly fixed — the phone keeps the automation list in the encrypted store (commit b343f2b, src/ai/automations.ts and src/memory/vault.ts). Automations still run only while the app is open; closed-app execution needs a native background scheduler, which is not built.
- LM-A05 (automations): Fixed — failure is no longer marked done for the day; retried on later opens up to 3 times a day, user told only when attempts used up; manual run now records failures the same way.
- LM-A06 (tool calls): Fixed — planner output checked by validateCall (src/ai/tool-calls.ts); unknown tools, wrong types, empty required text, over-long text, out-of-range reminder minutes, unknown language/action codes dropped before anything runs.
- LM-A07 (research): Fixed — research no longer offered to planner; research call dropped, no dependent flow reachable; research function refuses on purpose until zero-retention model verified.
- LM-A08 (export on a phone): Fixed — exportAll opens system share sheet with JSON; reports 0 when user cancels, so screen never says export happened when it did not.
- LM-A09 (live camera sessions): Open — needs a real phone camera to test.
- LM-A10 (retention sweep): Open — core sweep exists, but app persists no temporary item today (photos and frames live only in screen state), so there is nothing to sweep yet. Any future persisted temporary store must call it.
- LM-A11 (cost bound): Fixed — handled with LM-A02; reservation formula tested for every allowlisted model at largest allowed input and output; template allowance in pricing.ts.
- LM-A12 (screen size - assistant): Fixed — message bubble and wave bars moved to src/assistant/message-parts.tsx; assistant.tsx is about 570 lines (remaining code is screen state and layout).
- LM-A13 (screen size - capture): Fixed — answer formatting moved from capture.tsx to src/see/answer-format.ts with tests; capture.tsx is about 545 lines.
- LM-A14 (matrices): Fixed — reconciled on 2026-10-26 (PROGRESS.md, FEATURE_MATRIX.md, GAP_MATRIX.md).
- LM-A15 (pricing and endpoint privacy): Open — broker's price table is not re-verified against the live provider in this pass.
- LM-A16 (restore testing): Open — backup and restore path is not rerun in this pass.
- LM-A17 (accessibility on devices): Open — needs assistive-technology testing on phones.
