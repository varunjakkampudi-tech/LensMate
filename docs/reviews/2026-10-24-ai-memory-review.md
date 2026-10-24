# Review: AI assistant, vision, translation, agents, automations, memory and backup

Date: 2026-10-24. Baseline: `origin/dev` at f4caa63, plus the changes in this checkpoint.
Reviewer: agent (self-review against LensMate-v9 and LensMate-Goal). This is not a fresh-context independent review;
one is still required before any release (Goal section 16).

## Method

Read the broker routes, pricing, backup store and schema; the phone's AI, memory, speech, camera, automation and
enrolment code; and the save points of every screen. Exercised the flows in the browser against the dev broker in
live mode (one approved test set, see PROGRESS.md) and in mock mode.

## Findings

| # | Area | Finding | Severity | Status |
|---|---|---|---|---|
| R1 | Translation (v9 G15, checklist 3) | The spoken announcement played once per screen visit, not at every session start. | Medium (compliance) | Fixed here. Session start now follows v9's 2-minute silence rule (`src/ai/session.ts`, tested). |
| R2 | Memory (Ask my notes) | Keyword matching failed on punctuation and question words, so a saved note was reported as missing. | Medium (correctness) | Fixed. Shared matcher in `src/memory/search.ts`, tested. Found by a live test. |
| R3 | Enrolment | A revoked phone could not remove its credential, so it could not enrol again. | Medium (usability, lockout) | Fixed. Confirmed removal for enrolled credentials, tested. |
| R4 | Vault | Two concurrent calls could each create an encryption key, so items saved under the lost key were skipped on read. | High (data loss) | Fixed earlier (`b171580`). A single key promise and one connection now. |
| R5 | Automations | "Ran today" used UTC; an automation could run twice on one local day. | Medium | Fixed earlier. Local date, live test passed. |
| R6 | Speech | Browser recognition sends audio to the browser vendor's service. v9 section 10 requires on-device or approved routes. The owner approved free platform engines in OWNER-DECISION-003. | Medium (compliance, owner-approved) | Open. Native on-device route proposed in `docs/decisions/0001`. |
| R7 | Backup after revocation | A revoked device's backup row stays on the server until expiry, with no purge path. | Medium (privacy) | Open. Owner decision in `docs/decisions/0002`. |
| R8 | Backup after re-enrolment | A new device cannot recover the previous backup. This is by design, but the user is not told at restore time. | Low | Open. Wording to approve in `docs/decisions/0002`. |
| R9 | Mock answers | Mock replies showed a rupee cost as if it were real. | Low (honesty) | Fixed here. Labelled "Mock estimate, no provider call". |
| R10 | Vision | Vision is off until `BROKER_VISION_IMAGE_TOKEN_CEILING` is set. The dev value (1600) is the agent estimate; the owner's measurement is due. | Low (measurement) | Open. Owner measurement needed (OWNER-DECISION-003). |
| R11 | Prompt injection (v9 section 10) | Web research and saved notes are passed to a writer agent that has no tools. The planner sees only the user's goal, so text read from the world cannot plan actions. Phone actions are proposals the user must tap. | Low | Accepted with conditions: keep the planner away from web and note text, and keep the writer tool-free. Tests cover the action validation. |
| R12 | Logs | The broker's request logging records URLs and status, not bodies. Verified by reading `server.ts` logging calls; not by a log-content test. | Low | Open. A log-content test is recommended. |
| R13 | Dependencies | `zod` high advisory resolved with a pnpm override to 4.6.7. `node-forge` high advisory has no patched release in the registry. | High (advisory) | `zod`: fixed. `node-forge`: open, owner decision (BLOCKER-010). |

## Compliance checks (v9)

- Locked features (face or voice identity, identifying people, always-on camera, background recording, covert
  interview help): no code path. The only references are refusal text. Checked by search.
- Capture outside a session: camera stops when its view unmounts (`src/capture/camera.tsx`). Microphone runs only
  while held or in a started session (`src/ai/use-voice.ts`). The live browser test found no microphone calls while
  tabs were changed (zero `getUserMedia` or `SpeechRecognition.start` calls).
- Saved content: photos, notes and answers are saved only when the user taps Save, or when the user asks an agent to
  save (G13, G34). Automation answers are saved by the user's own automation. No temporary-capture store exists, so the
  24-hour rule has nothing to expire. Recorded here, not enforced by code.
- Cloud disclosure before first use: the setup card blocks AI until the notice is accepted (live tested).
- Spend cap: the broker reserves worst case before each call and settles afterwards; the cap is shown on the home
  screen (live tested: ₹0.00 of ₹500 before the test calls).
- No training on user data: recorded per model in `docs/governance/provider-privacy-and-models.md`; the zero data
  retention routing is set by the broker (`pricing.ts`, `provider.ts`).

## Not reviewed in depth

Individual screen layout and copy outside the AI and memory paths; device permission flows (not runnable here);
any native code (none exists yet).
