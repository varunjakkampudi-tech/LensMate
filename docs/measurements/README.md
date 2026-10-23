# Measurement procedures (BLOCKER-005)

Owner-run procedures for real-phone measurements of the LensMate P-1 software. The agent writes the procedures and templates. The owner runs the tests and records the results.

## Status

- Agent work: complete on 2026-10-24 (this folder). Procedures and templates only.
- Owner runs: NOT STARTED. They need BLOCKER-001 (Apple Developer Program membership) for an iPhone 15 development or TestFlight build. Android runs are not blocked by BLOCKER-001.
- No measurement has been made. Simulator and emulator results are never reported as real-device evidence.

## Files

- `iphone15-procedures.md`: the step-by-step procedure for the owner to run on an iPhone 15.
- `evidence-template.csv`: the import template. Every run is one row, with provenance fields.
- `README.md`: this index.

## Rules for every run

1. Do not put recordings, photos or video of the owner, the owner's home, or any other person in this repository. Keep raw files outside the repository and record only their location in the evidence row (`raw_location`).
2. Do not put personal details in the evidence file: no address, phone number, or location data.
3. Do not put API keys, tokens or provider credentials in any file. Environment variable names only.
4. Record every run, including failed runs. Do not delete or edit a row to change a result. A correction is a new row that references the old one in `notes`.
5. Each row records the exact app build it measured (`app_commit`, `eas_build_id`).

## Targets (from GAP_MATRIX, items 7 and 8)

- Interruption: within 0.5 s in at least 95 percent of tries (item 7).
- Latency budget: met in at least 90 percent of tries, per language (item 8). The budget value in milliseconds is not in this repository. The owner supplies it in `latency_budget_ms` from Goal 14.2 before the first run.
