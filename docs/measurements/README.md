# Measurement procedures and evidence (P-1)

Owner-run procedures for real-phone measurements of the LensMate P-1 software, and the import tool that validates the results. The agent builds the instrumentation, procedures and templates. The owner runs the real-phone tests.

## Status (2026-10-24)

- Agent implementation: partly complete. Instrumentation exists for capture to phone. The import validator and CLI exist. The simulator dry run passes. Not yet done: a measurement screen in the phone app, so no real-phone test can run.
- Owner runs: NOT STARTED. They need BLOCKER-001 (Apple Developer Program) for an iPhone build.
- No measurement has been made on a real phone. Simulator and emulator results are never reported as real-phone evidence.

## Files

- `procedures/iphone15-procedures.md`: the owner procedure. It is marked NOT RUNNABLE until the measurement screen exists.
- `evidence-template.csv`: the result template. The header is generated from the validator's column list. Each row is one try.
- `traceability.md`: each requirement, its implementation, its tests and its evidence level.

## Import a result file

```bash
pnpm measure:import <results.csv>
```

The tool prints a JSON report. It lists every rejected row with each reason, and a summary per evidence level and measure. It exits with 1 when any row is rejected or the file is malformed. Only accepted rows count. Simulator rows are reported separately from real-phone rows.

## Rules for every run

1. Do not put recordings, photos or video of the owner, the owner's home or any other person in this repository. Keep raw files outside the repository and record only their location in `raw_location`, without a home folder path.
2. Do not put personal details in result files: no address, phone number, location data or email address. The import tool rejects the common forms.
3. Do not put API keys, tokens or provider credentials in any file. Use environment variable names only.
4. Record every try, including failed ones. Do not delete or edit a row to change a result.
5. Every row names the app build and the commit it measured. A real-phone row also names its EAS build ID.

## Targets

Design targets from LensMate-v9 section 6.4, not release guarantees:

- Capture to phone: 300 ms or less per try.
- Total short request: under 2500 ms, with at least 50 requests per language and at least 90 percent meeting the budget (Goal 14.2).
- Interruption: stop within 500 ms in at least 95 percent of tries (G19 target).

Latency and interruption are not yet instrumented end to end, so they cannot be measured yet. The traceability matrix shows exactly what is and is not measured.
