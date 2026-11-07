# LensMate Blockers

Each blocker names the exact missing dependency and only the checklist fields it actually stops. Work that does not need the dependency continues. Revised per ChatGPT review CR-03 (commit 7c0c2fd).

| ID      | Missing dependency                                                                                     | Blocks (exact fields)                                                                 | Does NOT block                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| BLK-001 | Physical LensMate glasses hardware, evaluation boards, and approved BOM                                | Hardware-validation field for A01–A28; on-device validation of B10–B12; Q03, Q07, Q10 | Hardware interface specs, driver abstraction, simulation, documentation, procurement research    |
| BLK-002 | Live provider accounts and API credentials (none provisioned; none created or requested by this repo)  | Live acceptance tests for M02–M07, M09, M10, I05                                      | Provider adapters, schemas, error handling, and deterministic contract tests with mock providers |
| BLK-003 | External certification and legal compliance review                                                     | Q19, N20, N21                                                                         | Requirements documentation and internal checks                                                   |
| BLK-004 | Real-world user trials and independent engineering staff outside this repo                             | Q20, Q21                                                                              | All other items                                                                                  |
| BLK-005 | Real ChatGPT review replies (the review session is reachable; approvals arrive only as actual replies) | Review field stays PENDING until a real reply arrives                                 | Implementation work continues; review is never assumed                                           |

## Resolved

- BLK-005 (earlier form): the review session replied to commit 7c0c2fd with CHANGES_REQUESTED. Changes CR-01 to CR-05 are addressed in the commit that introduces this file revision.

## Notes

- No blocker has been resolved by assumption. Hardware and provider blockers stay open until the owner supplies the dependency.
