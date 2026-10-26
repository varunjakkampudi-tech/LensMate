# LensMate roadmap and open items

Last updated: 2026-10-27. This file replaces the old blocker log, the progress log and the matrices, which were removed in
the cleanup. Their last versions are on the branch `archive/pre-cleanup-2026-10-26`.

## 1. Product direction (owner, 2026-10-26)

- **Main product:** AI glasses. The glasses capture photos and video, hear a question, and speak an answer.
- **Phone:** the glasses' companion and the place where everything is stored. The phone app is updated continuously
  alongside the glasses.
- **Storage requirement (main):** every photo, video and answer is saved directly on the phone the glasses are connected
  to, in encrypted storage. The glasses keep only a short buffer until the phone confirms it has the file.
- **Personal use first.** No sale or third-party access until the owner decides otherwise.

## 2. Owner requirements

1. Capture a photo in high quality with one button press or a voice command.
2. Capture video, recorded on the glasses with the recording light on, then saved to the phone.
3. Ask anything and get a friendly, spoken answer that acts as a second brain: it uses the owner's saved notes.
4. Remember a person the owner names, with notes the owner writes (where we met, what we talked about). Automatic face
   recognition of other people is not built (see `docs/hardware/glasses-spec.md`, section 11.3).
5. Fast: button to light under 200 ms, first spoken word about 2 s. Targets are measured, not assumed.
6. Read phone notifications aloud when asked (Android, after the owner grants access).

## 3. What the repository contains now

- **Phone app** (`apps/mobile`): home status board, morning briefing, see (camera), hear and talk (voice assistant),
  translate, notes and memory (encrypted on the phone), routines (run only while the app is open), diagnostics, the
  glasses simulator, enrolment with the broker, and the measurement recorder for device tests.
- **Shared packages:** `packages/core` (glasses link, indicator, spend cap), `packages/protocol` (the glasses message
  format), `packages/simulator` (virtual glasses).
- **Broker** (`services/broker`): the server that makes AI calls, with the monthly spend cap, zero-retention provider
  settings, device enrolment and encrypted backup.
- **Docs:** `docs/product/feature-register.md` (features), `docs/hardware/glasses-spec.md` (glasses), `docs/governance`
  (risk exceptions, provider privacy, branch policy), runbooks and decisions.

## 4. Removed in the cleanup (2026-10-26)

- **Interview practice:** the screen, its home tile, its profile button and its feature switch. It was off by default and
  outside the glasses-first direction.
- **Governance readiness scorecard:** the home-screen section, its registry and its generator tool. It tracked the
  project, not the product.
- **Governance documents:** the root matrices, the progress log, the blocker log, and the investigation, review,
  UI-audit, handoff and status folders. Kept: `docs/governance`, `docs/product`, `docs/hardware`, `docs/decisions`,
  `docs/architecture`, `docs/runbooks`, `docs/deploy`, `docs/testing`, `docs/research`, `docs/measurements`.

## 5. New items list (complete)

Status key: **Built** (in code, tested), **Partial**, **Not started**, **Owner** (needs your decision, account or purchase).

### A. Glasses hardware (Phase 1 prototype)

| #   | Item                                                                                                      | Status                           |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------- |
| A1  | Choose the prototype parts: Linux board, 12 MP camera module, microphone, speaker, battery, light, button | Owner (approve parts and totals) |
| A2  | Buy the parts after the exact models and totals are confirmed                                             | Owner                            |
| A3  | Set up the Linux board, camera capture and the recording light, controlled by firmware                    | Not started                      |
| A4  | Photo capture at high quality, saved on the glasses, then sent to the phone over Wi-Fi                    | Not started                      |
| A5  | Video capture, limited to 40 seconds per recording, saved to the phone after recording                    | Not started                      |
| A6  | Button and voice triggers (press to capture, hold to talk, double press for video)                        | Not started                      |
| A7  | Battery and charging circuit, measured life                                                               | Not started                      |
| A8  | Comfortable frame, tested with four hours of wear                                                         | Not started                      |

### B. Glasses software and link

| #   | Item                                                                                  | Status                                               |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| B1  | Message format for photos, video and audio (protocol v1 additions, new field numbers) | Not started                                          |
| B2  | Bluetooth control link plus Wi-Fi bulk transfer to the phone                          | Not started                                          |
| B3  | Real glasses implementation behind the existing `GlassesLink` interface               | Not started                                          |
| B4  | Simulator covers every new message, so tests run without hardware                     | Not started                                          |
| B5  | Signed firmware updates, with rollback and a canary pair of glasses                   | Not started                                          |
| B6  | Recording light cannot be bypassed: capture refuses to start without it               | Partial (enforced in the simulator and the protocol) |

### C. Phone features

| #   | Item                                                                                                   | Status                                                         |
| --- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| C1  | Home status board (camera, microphone, memory, routines, AI)                                           | Built                                                          |
| C2  | Morning briefing with Read aloud                                                                       | Built                                                          |
| C3  | Confirm-before-act for every phone action                                                              | Built (actions are proposals; nothing opens until tapped)      |
| C4  | Save glasses photos and video into encrypted phone storage                                             | Not started (main requirement)                                 |
| C5  | Native Android build with native voice switched on                                                     | Partial (permissions declared; build needs owner's Expo login) |
| C6  | Notification reading aloud on Android (owner grants access)                                            | Not started                                                    |
| C7  | Named-person notes: add, edit, and "what do I know about X"                                            | Not started                                                    |
| C8  | Voice barge-in (interrupt the answer by speaking)                                                      | Not started                                                    |
| C9  | Background routines (run while the app is closed)                                                      | Not started (needs a native scheduler)                         |
| C10 | Stop-command latency measured on a device: stop within 500 ms in 95 percent of tries (the code target) | Partial (measured in code only)                                |
| C11 | Over-the-air phone updates through Expo Updates                                                        | Not started                                                    |

### D. AI and broker

| #   | Item                                                                                 | Status                                                                                 |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| D1  | Monthly AI budget for the glasses: INR 500 a month (owner decision, 2026-10-27)      | Decided                                                                                |
| D2  | Free OpenRouter models: rejected, because they fail the zero-retention rule (tested) | Owner (choose a paid model that passes, or accept data-keeping for non-personal tests) |
| D3  | Vision model for photo questions, chosen to pass zero-retention                      | Not started (after D2)                                                                 |
| D4  | Research provider for live web answers                                               | Owner (choose provider and budget)                                                     |
| D5  | Anthropic as a second provider                                                       | Skipped by owner                                                                       |

### E. Owner-only

| #   | Item                                                                        | Status                                  |
| --- | --------------------------------------------------------------------------- | --------------------------------------- |
| E1  | Android phone test with the Android development build                       | Owner (needs `eas login` and the build) |
| E2  | Google Play developer account                                               | Owner (creating now)                    |
| E3  | Apple Developer account (for iPhone, later)                                 | Owner                                   |
| E4  | Decision: approve notification reading on Android                           | Owner                                   |
| E5  | Decision: people approach (named notes only, no automatic face recognition) | Owner (recommended)                     |
| E6  | Maximum video length per recording: 40 seconds (owner decision, 2026-10-27) | Decided                                 |

### F. Engineering debt to clean next

| #   | Item                                                                                                          | Status                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Remove the stale references to the removed files and to the old spec numbers (v9, Goal, G-numbers) in docs    | Partly done (code comments, links and runbook instructions fixed; traceability tables, ADRs and the feature register still hold old references) |
| F2  | Remove the demo screen and its mock data if the owner does not use it                                         | Owner (decide)                                                                                                                                  |
| F3  | Remove the first-version glasses-link comments that describe the old plan                                     | Not started                                                                                                                                     |
| F4  | Remove unused demo-only code paths once C4 is built                                                           | Not started                                                                                                                                     |
| F5  | Remove the Android permissions not needed by the app (draw-over-apps, external storage) after the device test | Not started (test first)                                                                                                                        |

## 6. Working method (same for LensMate, CareerScope and OraOne)

- `dev` is the working branch. `main` is production, and changes only with the owner's approval for that action.
- Work is split between the lead (Claude) and two workers (Codex and Antigravity) in their own worktrees. Workers do not
  commit, push, or touch secrets. The lead reviews each patch on a clean copy, runs the checks, and merges.
- A feature counts as done only when it passes CI and is tested on the device it targets. Numbers are measured, never assumed.
