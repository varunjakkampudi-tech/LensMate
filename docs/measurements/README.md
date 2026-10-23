# Measurement procedures and evidence (P-1)

Owner-run procedures for real-phone measurements of the LensMate P-1 software, the measurement screen the operator uses, and the import tool that validates the results. The agent builds the instrumentation, the screen, the procedures and the templates. The owner runs the real-phone tests.

## Status (2026-10-24)

- Simulator workflow: complete and tested. The measurement screen runs against the virtual glasses, records simulated taps, and exports a CSV that the validator checks.
- Owner iPhone runs: NOT YET RUNNABLE. They need BLOCKER-001 (Apple Developer Program), an EAS build, and a VoiceOver pass on the device. The procedure lists each requirement.
- Not instrumented: total latency, interruption, speech accuracy, translation and spend. They need the speech, translation and provider pipelines, which do not exist yet.
- No real-phone measurement has been made. Simulator and emulator results are never reported as real-phone evidence.

## Files

- `procedures/iphone15-procedures.md`: the owner procedure. It has the executable simulator workflow and the requirements for an iPhone run.
- `evidence-template.csv`: the result template. Its header is generated from the validator's column list. Each row is one try.
- `traceability.md`: each requirement, its implementation, its tests and its evidence level, plus the test inventory.

## Use the measurement screen

Open the measurement screen from the home screen of the app. The procedure in `procedures/iphone15-procedures.md` lists each step. Run the simulator workflow end to end with:

```bash
pnpm -F @lensmate/mobile test
```

## Import a result file

```bash
pnpm measure:import <results.csv>
```

The tool prints a JSON report. It lists every rejected row with each reason, and a summary per evidence level, timing source and measure. It exits with 1 when any row is rejected or the file is malformed. Only accepted rows count. Simulator rows are reported separately from real-phone rows.

## Rules for every run

1. Do not put recordings, photos or video of the owner, the owner's home or any other person in this repository. Keep raw files outside the repository and record only their location in `raw_location`, without a home folder path.
2. Do not put personal details in result files: no address, phone number, location data or email address. The import tool rejects the common forms.
3. Do not put API keys, tokens or provider credentials in any file. Use environment variable names only.
4. Record every try, including failed ones. Do not delete or edit a row to change a result.
5. Every row names the app build and the commit it measured. A real-phone row also names its EAS build ID.
6. Timing is taken from one clock only. Two independent device clocks are never subtracted until a clock synchronization is validated.

## Targets

Design targets from LensMate-v9 section 6.4, not release guarantees:

- Capture to phone: 300 ms or less per try.
- Total short request: under 2500 ms, with at least 50 requests per language and at least 90 percent meeting the budget (Goal 14.2).
- Interruption: stop within 500 ms in at least 95 percent of tries (G19 target).

The traceability matrix shows exactly what is and is not measured.
