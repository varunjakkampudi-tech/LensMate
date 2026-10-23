# iPhone 15 measurement procedures (owner-run)

Read `README.md` in this folder first. These procedures are for the owner to run. The agent does not run them.

## Prerequisites (owner)

1. BLOCKER-001 resolved: Apple Developer Program membership is active and the team identifier is stored in EAS credentials only.
2. A development build of the app is installed on the iPhone 15. Build it with `npx eas-cli build --platform ios --profile development` from `apps/mobile`, under the owner's Expo account. Record the EAS build ID and the commit it was built from.
3. The virtual glasses link is available for the test, or the owner confirms that the real glasses hardware is not part of this run. Simulator or emulator results are never entered as real-device evidence.
4. Test samples (spoken phrases and any video or audio) are kept outside the repository.

## Setup for each session

1. Record the date and time (UTC), the iPhone model (iPhone 15), the iOS version, the app commit, and the EAS build ID.
2. Set the phone to the language under test (English, Telugu, Hindi, or mixed). Record it in `language`.
3. Turn off other apps that use the microphone or the camera. Keep the phone at room temperature. Record any deviation in `notes`.
4. Charge the phone above 50 percent. Record the battery level at the start.

## Procedure A: interruption time (GAP_MATRIX item 7)

Target: an interruption is handled within 0.5 s in at least 95 percent of tries.

1. Start the virtual glasses link in the app.
2. Start a listening session.
3. Trigger an interruption with the agreed gesture or voice command. Note the moment of the trigger (`t_trigger`).
4. Note the moment the app stops speech or responds (`t_response`) from the on-screen timer or the screen recording.
5. Compute `interruption_ms = t_response - t_trigger`.
6. Repeat for at least 20 tries in each language. Record each try as one row.
7. Result: `pass` if `interruption_ms` is 500 or less. Otherwise `fail`.

## Procedure B: latency budget (GAP_MATRIX item 8)

Target: the latency budget is met in at least 90 percent of tries, per language. The budget is `latency_budget_ms`, which the owner supplies from Goal 14.2.

1. Use the same setup as Procedure A. Use a fixed set of phrases for each language. Store the phrase list outside the repository and record its name in `notes`.
2. For each try, measure the time from the end of the spoken phrase (`t_end_speech`) to the first audible or on-screen response (`t_first_response`).
3. Compute `latency_ms = t_first_response - t_end_speech`.
4. Repeat for at least 20 tries per language. Record each try as one row.
5. Result: `pass` if `latency_ms` is at most `latency_budget_ms`. Then report the pass rate per language. The target is at least 90 percent.

## Procedure C: session and privacy checks (GAP_MATRIX items 8 and 9 context)

These are functional checks, not timing. Record each as one row with `measure = privacy_indicator`.

1. Confirm the capture indicator is shown during capture and removed when capture ends.
2. Confirm that a locked feature is absent from the screen and the app.
3. Record `pass` or `fail` and a short note.

## Recording results

1. Copy one row per try into `evidence-template.csv` (a local copy outside the repository is fine).
2. Fill every column. Leave no field empty. Use `NA` only where a field does not apply, and say why in `notes`.
3. Keep the raw timing or screen recording outside the repository and put its location in `raw_location`.
4. Send the completed CSV to the agent with the commit it measured. The agent imports the rows into `PROGRESS.md` as evidence, with the summary counts only.

## Stop conditions

- Stop and record `fail` if the phone overheats, the battery drops below 20 percent, or the app crashes. Record the crash log location in `raw_location`.
- Do not continue a session that has a safety concern. Report it to the agent.
