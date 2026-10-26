# Open-source references for LensMate (verified 2026-10-26)

Facts below come from the GitHub API (licence, last push, archive status) and were checked on the date above. Ratings are judgement, not measurement. No code has been copied from any repository. Nothing here changes the architecture: LensMate stays Expo, React Native, TypeScript, Fastify, PostgreSQL, OpenRouter, the existing broker and the INR 500 monthly cap.

## Verified facts

| Repository | Licence (GitHub) | Language | Last push | Archived | Stars |
|---|---|---|---|---|---|
| Mentra-Community/MentraOS | Apache-2.0 | TypeScript | 2026-10-26 | no | 2391 |
| livekit/agents | Apache-2.0 | Python | 2026-10-26 | no | 14938 |
| pipecat-ai/pipecat | BSD-2-Clause | Python | 2026-10-26 | no | 16826 |
| brilliantlabsAR/frame-codebase | NOASSERTION (unclear) | C | 2025-10-05 | no | 533 |
| brilliantlabsAR/frame_realtime_gemini_voicevision | BSD-3-Clause | Dart | 2026-02-09 | no | 82 |
| BasedHardware/OpenGlass | MIT | C | 2025-09-22 | no | 4207 |
| mem0ai/mem0 | Apache-2.0 | Python | 2026-10-23 | no | 67834 |
| browser-use/browser-use | MIT | Python | 2026-10-24 | no | 119167 |
| OpenSQZ/OpenGlass | none (no licence file) | Python | 2026-10-17 | no | 37 |

Corrections to the earlier summary: OpenSQZ Glass has no licence, so its code may not be copied or redistributed. The Brilliant Labs firmware licence is unclear. Both are excluded from code reuse until the owner or the authors clarify.

## Comparison

| Repository | Relevant features | LensMate gaps it addresses | Reusable parts | Fit for LensMate (judgement) | Licence | Integration difficulty | Benefits | Risks | Priority |
|---|---|---|---|---|---|---|---|---|---|
| MentraOS | Glasses pairing, sensor events, permissions, streaming, companion-app architecture | Device abstraction and phone-side glasses link (packages/core glasses state, virtual glasses link) | Design of device lifecycle and permission model. Code only as a reference | 8/10 (same language; its platform is a full cloud and SDK) | Apache-2.0 | High if adopted as a whole; low if used as design reference | Mature glasses architecture | Depends on its own cloud and SDK; hardware-specific assumptions | Design reference now; revisit with hardware |
| LiveKit Agents | Voice pipeline, turn detection, interruption, tool calls, test harness | Barge-in and endpointing (F26 partly built), latency measurement | Concepts only: turn detection, interruption handling, latency metrics | 7/10 as a reference. Python server, so not a drop-in | Apache-2.0 | High (Python runtime) | Proven turn-taking design | Adds a Python service and a second voice stack | Study now; implement the concepts in TypeScript |
| Pipecat | Multimodal pipeline, STT/TTS, provider switching, agent handoffs | Pipeline orchestration for SEE/HEAR/TALK | Concepts only | 6/10. Same reasons as LiveKit | BSD-2-Clause | High (Python) | Clear pipeline model | A second voice framework would add latency and cost | Alternative to LiveKit; do not adopt both |
| Brilliant Labs frame-codebase | Glasses firmware, BLE, camera transport | Hardware path (F12 and later) | None until licence is clear | 5/10 now; hardware is not in scope yet | unclear | High | Hardware reference | Unclear licence; C firmware | Hold until hardware phase and licence clarified |
| Brilliant Labs frame_realtime_gemini_voicevision | Live voice and vision with a glasses client | Reference for live vision flow | Concepts only (Dart client) | 5/10. Dart client, Gemini-specific | BSD-3-Clause | High | Shows a live vision loop | Gemini-specific, Dart | Reference only |
| OpenGlass (BasedHardware) | Glasses firmware and capture | Hardware reference | Concepts only (C firmware) | 4/10 for this stack | MIT | High | Permissive licence | C firmware, hardware-specific | Reference only, hardware phase |
| Mem0 | Persistent memory: extraction, retrieval, self-hosting | Advanced memory and recall (F6 partly built) | A separate memory service behind the broker, or design patterns | 7/10 later. Adds a Python service and cost | Apache-2.0 | Medium-high | Strong memory model | Hosting, cost, personal-data handling; needs owner decision | Owner decision after phone testing |
| Browser Use | Browser automation driven by an agent | Live actions (research is intentionally unavailable) | Concepts only | 5/10 for LensMate now | MIT | High | Mature browser automation | Real accounts and browser control are high risk; Python | Owner decision; do not adopt before a security review |
| OpenSQZ Glass | Local-first wearable inference | Offline vision research | None (no licence) | Not usable | none | n/a | n/a | Cannot be copied | Excluded |

## Decisions

1. Do not copy code from any repository in this round.
2. Adopt design ideas only, and implement them in TypeScript inside the existing modules.
3. Keep native speech, native automations and any hardware-gated feature disabled until device tests and owner approval exist.
4. Mem0 and Browser Use require owner decisions (hosting, cost, data and security review) before any work.
5. Do not add a second voice framework. Choose one reference for turn-taking design (LiveKit concepts), not both.

## Roadmap (ordered by value, feasibility, cost and dependencies)

1. P-1 reliability on real phones: owner runs docs/testing/device-checklist.md on iPhone and Android. Blocked on devices.
2. Turn-taking and barge-in design (LiveKit concepts): endpointing and interruption timing, with latency measurements recorded in the app. Testable in code now using fake timers.
3. Glasses link abstraction (MentraOS design): a clear device interface in packages/core so hardware can be added later without changing the app. Testable now.
4. Memory design review (Mem0 patterns): retention, recall ranking and deletion guarantees inside the existing encrypted store. Owner decision on any external service.
5. Browser actions (Browser Use concepts): only after a threat model and an owner decision. Not before phone testing of SEE, HEAR and TALK.
6. Hardware (Brilliant Labs, OpenGlass): after the licence is clarified and hardware is available.
