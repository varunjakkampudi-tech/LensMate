# Measurement procedure (owner-run)

Status (2026-10-24):

- Simulator workflow: EXECUTABLE. The measurement screen in the app runs against the virtual glasses, and its tries export to a CSV the validator checks. Use it to rehearse the procedure. Its evidence is simulator evidence.
- iPhone 15 run: NOT YET RUNNABLE. Section "Requirements before an iPhone run" lists what is still missing. Do not record a result from an iPhone until every requirement there is met and the run is reported with real phone evidence.

Read `../README.md` first for the rules that apply to every run.

## Supported measures and what they mean

| Measure                             | Status           | What it times                                                                                                                                                        |
| ----------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture_to_phone`                  | Instrumented     | The in-app path, from the glasses' button event to the phone's receipt. Both timestamps come from one clock, so this is harness timing. It is not transport latency. |
| `latency_total`                     | NOT INSTRUMENTED | Needs recognition, translation and speech output. The app has none yet.                                                                                              |
| `interruption`                      | NOT INSTRUMENTED | Needs speech output to stop. The app has none yet.                                                                                                                   |
| Speech accuracy, translation, spend | NOT INSTRUMENTED | Need the speech, translation and provider pipelines.                                                                                                                 |

The screen shows each measure with its status and target. Anything not instrumented is labelled that way and never shown as a result.

## Tries per measure and owner questions

Each measure is listed with the tries the documents require. Nothing here is a decided value beyond what Goal 14.2 and v9 state.

| Measure                           | Tries and target (source)                                                                                        | Status                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `capture_to_phone`                | One try per single tap. Reported only; the documents set no pass rule for this stage (v9 6.4 gives 0.3 seconds). | Instrumented (simulator). Not yet run on a phone                                                               |
| `latency_total`                   | 50 requests per language; 90 percent under 2.5 seconds (Goal 14.2, v9 6.4)                                       | NOT INSTRUMENTED                                                                                               |
| `interruption`                    | Stop within 0.5 seconds in 95 percent of tries (Goal 14.2, G19). The documents set no minimum number of tries    | NOT INSTRUMENTED                                                                                               |
| Speech accuracy (word error rate) | Recorded sets in English, Telugu, Hindi and mixed speech (v9 6.1). Set size is not decided                       | NOT INSTRUMENTED                                                                                               |
| Translation                       | v9 section 12 scripts for each language pair; native-speaker scoring by the owner                                | NOT INSTRUMENTED                                                                                               |
| Spend                             | Cost per request type and projected monthly cost against the cap                                                 | CALCULATED by `calculateSpend` (not measured). Measured spend NOT INSTRUMENTED (needs approved provider calls) |

Owner questions. The agent does not choose these; the owner decides and records the answer in `docs/product/ROADMAP.md`:

1. Minimum number of tries for interruption. The 95 percent target is set; the number of tries is not.
2. Size and content of each speech sample set (English, Telugu, Hindi, mixed).
3. Latency acceptance wording: 90 percent of the 50 tries per language, measured on the total short request, with stage pass rates as diagnostics only (`traceability.md`, open decision 2).
4. Whether a phone run with virtual glasses, in-app path only, counts as real phone evidence (`traceability.md`, open decision 4).

## Simulator workflow (executable now)

1. Build and run the app in a development environment, or run the mobile tests: `pnpm -F @lensmate/mobile test`. The end-to-end test in `measurement-screen-e2e.test.tsx` drives this exact workflow. For the simulator dry run alone, run `pnpm measure:dry-run`: 50 scripted tries in English and 50 in Telugu, labelled SIMULATOR evidence. It writes `measurement-output/SIMULATOR-dry-run-capture_to_phone.csv` (git-ignored). The validator refuses that file's rows as real phone evidence, so a relabelled copy cannot pass. It rehearses the procedure and is not a measurement.
2. Open the measurement screen from the home screen.
3. Connect the virtual glasses.
4. Fill in the provenance:
   - Run ID: a unique name for this run, with no personal details.
   - Evidence level: Simulator (or Emulator for the Android emulator).
   - Who ran the test: Agent (dry run) for an agent rehearsal. Owner is only for an owner run.
   - Device model, OS version, app build, app commit, network type, sample set. Provider defaults to `none`. Battery is optional.
5. Choose the language for the tries: English, Telugu, Hindi, or Mixed speech. Each language has its own trial numbers.
6. Start the session. The provenance is locked while the session runs.
7. Send single taps with the simulated button. Each tap is one try. Repeat for each language you need.
8. End the session.
9. Build the CSV. The screen shows the validator result: how many rows were accepted and rejected, and why. Copy the CSV from the text box.
10. Save the CSV outside the repository. Check it with `pnpm measure:import <file>`.

The screen blocks a session with missing or inconsistent provenance and lists each problem. The validator rejects any row that lacks provenance, so a simulator rehearsal cannot pass as real evidence.

## Export and send the file

1. Run `pnpm build` once in the repository root, so the import CLI has its built output (the `dist` folders are not tracked).
2. Run `pnpm measure:import <file>` from the repository root. A usable file reports `"fileErrors": []` and an empty `"rejected"` list, and exits with code 0. Rejected rows are not counted. Do not edit a row to make it pass; record a correction as a new row (see "Recording results").
3. Save the CSV outside the repository under a neutral name such as `<run-id>.csv`. Keep the name free of personal details.
4. Send the CSV to the agent, through a channel the owner chooses, with: the app commit it measured, the EAS build ID for a real phone run, and the import report from step 2. Do not commit the CSV, paste it into a public issue, or attach raw recordings.
5. Raw recordings and screen captures stay outside the repository. Only their location goes in `raw_location`.

## Requirements before an iPhone run

Each of these must be met. Until then the iPhone run is not runnable:

1. **Apple Developer Program membership (BLOCKER-001).** Needed for a development or TestFlight build. Deferred by the owner until iPhone testing is scheduled.
2. **EAS build of the app.** Build with `npx eas-cli build --platform ios --profile development` from `apps/mobile`, under the owner's Expo account. Record the EAS build ID. The provenance requires it for real phone evidence.
3. **Timing rule for real transport.** Two independent device clocks may not be subtracted until a clock synchronization is validated. The screen and the virtual glasses share one clock, so a run on the iPhone with virtual glasses measures only the in-app path. A run with real Bluetooth glasses needs a validated clock synchronization first. Until then it is not measurable.
4. **Owner-run only.** The agent never runs tests on the owner's phone. The validator rejects real phone rows run by the agent.
5. **Real phone evidence is labelled as such.** The device name must not say simulator or emulator. The validator rejects the contradiction.
6. **Accessibility on device.** VoiceOver on the iPhone has not been checked. The automated checks cover roles, labels and states only. The owner runs a VoiceOver pass on the screen and records the result in `docs/product/ROADMAP.md`.
7. **Language sample sets.** English, Telugu, Hindi and mixed speech sample sets are owner-supplied and stay outside the repository. The sample set name goes in the provenance.

## Recording results

- One row per try. Do not delete or edit a row to change a result. A correction is a new row whose notes refer to the old `measurement_id`.
- A failed try is still a row, with `outcome` `failed` and notes that say what failed.
- Keep raw recordings and screen captures outside the repository. Put only their location in `raw_location`, using a neutral name without a home folder path.
- Send the CSV with the app commit it measured. The agent imports it and records the summary with its evidence level.

## Stop conditions

- Stop and record a failed try if the phone overheats, the battery drops below 20 percent, or the app crashes. Put the crash-log location in `raw_location`.
- Stop the session if anything about it is a safety concern, and tell the agent.
