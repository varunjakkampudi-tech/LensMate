# QUALITY_AUDIT

Scope: the software track at the checkpoint recorded in `PROGRESS.md`. This audit lists what was measured and what is not yet covered. It does not claim any category is complete.

## Definition of done (Standards 7.4) at this checkpoint

| #   | Check                                                 | Result                                                                                         |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Typecheck, zero errors                                | PASS                                                                                           |
| 2   | Lint and format, zero errors                          | PASS                                                                                           |
| 3   | Unused code (knip)                                    | PASS                                                                                           |
| 4   | Unit tests and coverage thresholds (root packages)    | PASS (96.9 percent lines, 94.3 percent branches)                                               |
| 5   | Firmware host tests                                   | NOT APPLICABLE YET (no firmware code; Stage J)                                                 |
| 6   | Integration and UI tests                              | PARTIAL (mobile UI tests exist; no real-provider integration, which is correct for this stage) |
| 7   | Emulator and simulator end-to-end, English and Telugu | NOT STARTED                                                                                    |
| 8   | Session, gesture and privacy suites                   | PARTIAL (indicator rule only)                                                                  |
| 9   | Accessibility checks on changed screens               | PARTIAL (labels and roles in code; no automated check yet)                                     |
| 10  | Dependency audit                                      | NOT RUN (no audit step in CI yet; recorded as QA-004)                                          |
| 11  | Secret scan                                           | PASS (CI)                                                                                      |
| 12  | App and package builds (debug)                        | PARTIAL (packages build; app build needs an EAS build under the owner account, BLOCKER-002)    |
| 13  | Feature switch defaults                               | NOT STARTED (switch framework is Stage H)                                                      |

## Findings and dispositions

| ID     | Finding                                                                        | Severity                                          | Disposition                                                                                    |
| ------ | ------------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| QA-001 | The Expo installer proposed cooldown exemptions automatically                  | High (weakens a supply-chain control if accepted) | FIXED: exemptions removed; SDK pinned to a version outside the cooldown; ADR 0001; BLOCKER-003 |
| QA-002 | Prettier rewrote the generated schema and broke the drift check in CI          | Medium                                            | FIXED: generated file excluded from Prettier (CI run 39333315890 passed)                       |
| QA-003 | Jest did not discover mobile tests inside a checkout path with a dot-directory | Low                                               | FIXED: `testRegex` in the mobile Jest config                                                   |
| QA-004 | No dependency audit step in CI                                                 | Medium                                            | OPEN: add an audit gate before Stage C                                                         |
| QA-005 | Expo SDK pins not aligned with the versions the SDK expects                    | Medium                                            | OPEN: BLOCKER-003 (due after the cooldown)                                                     |

## Categories not yet verified (Global standard, applicable to this repository)

Categories 16 (accessibility), 17 (responsive), 19 (performance), 21 (localization), 22 (security beyond the secret scan), 25 (test suites beyond unit), 26 (functional verification), and 27 (release protections beyond the current jobs) are NOT verified. Category 23 (AI) and category 28 (deployment) do not apply until a broker or backend exists. Each open item is tracked in `GAP_MATRIX.md` or `blocker.txt`.
