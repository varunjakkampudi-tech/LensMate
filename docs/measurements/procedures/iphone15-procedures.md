# iPhone 15 measurement procedures (owner-run)

Status: NOT RUNNABLE YET. Read this section before anything else.

- The phone app has connect and disconnect controls only. It has no control that sends a tap to the virtual glasses, no form for the provenance fields, and no export. The recorder that times capture to phone exists in code (`apps/mobile/src/measurement-recorder.ts`) but is not wired to any screen.
- The end-to-end latency (`latency_total`) and interruption measures cannot be run at all yet. The phone app has no recognition, translation or speech output, so those stages have no events to time.
- Owner runs also need BLOCKER-001 (Apple Developer Program membership) for an iPhone development or TestFlight build.
- The agent will add the measurement screen (tap control, provenance form and CSV export) as the next implementation step. This document will be updated with the real steps when that screen exists. Until then, do not run anything from this file and do not record results.

Read `../README.md` for the rules that apply to every run.

## When the procedure can run

All of the following must be true:

1. BLOCKER-001 is resolved, and an iPhone 15 development build exists with its EAS build ID.
2. The measurement screen exists in the build (the agent will record the commit that adds it).
3. For each measure you run, the instrumentation for that measure exists in that commit (see `../traceability.md`).

## Setup (once the screen exists)

1. Record the date (UTC), the iPhone model, the iOS version, the app commit, the EAS build ID, the network type and the provider.
2. Record a `run_id` that is unique for this run and contains no personal details.
3. Choose the language (`en`, `te`, `hi`, `mixed`) for the run.
4. Note the battery level at the start, if it is relevant to the run.
5. Keep test samples outside the repository and record only the sample-set name.

## Measures

### capture_to_phone (instrumented in code; the screen is still needed)

Target: 300 ms or less (v9 section 6.4). Acceptance: none is stated for this stage alone. It is reported as a pass rate.

1. Start the virtual glasses link in the app. Note that the glasses are virtual, so the evidence is "real phone" only for the phone's timing, not for glasses hardware.
2. Send one tap for each try, using the measurement screen's tap control.
3. Export the CSV from the screen and fill in the provenance columns the screen does not fill.
4. Run at least 50 tries per language, so the result can be compared with the later end-to-end target.
5. Import the file with `pnpm measure:import <file>`.

### latency_total and interruption (NOT instrumented on the phone yet)

Do not run these. They need recognition, translation and speech output, and interruption needs a press that stops speech. Their targets are kept here for reference only:

- `latency_total`: under 2500 ms end to end, at least 50 requests per language, at least 90 percent meeting the budget (v9 section 6.4, Goal 14.2).
- `interruption`: stop within 500 ms in at least 95 percent of tries (G19, GAP_MATRIX item 7).

## Recording results

1. Use one row per try. Do not delete, edit or reorder a row to change a result. A correction is a new row whose `notes` refer to the old `measurement_id`.
2. Keep raw recordings and screen captures outside the repository. Put only their location in `raw_location`, using a neutral name without a home folder path.
3. A failed try is still a row: `outcome` is `failed` and `notes` says what failed.
4. Send the completed CSV to the agent with the app commit it measured. The agent imports it with `pnpm measure:import`, and the summary goes into `PROGRESS.md` with the evidence level.

## Stop conditions

- Stop and record a failed try if the phone overheats, the battery drops below 20 percent, or the app crashes. Put the crash-log location in `raw_location`.
- Stop the session if anything about it is a safety concern, and tell the agent.
