# LensMate Blockers

External dependencies that stop an item from being completed. Each blocker records the item IDs it affects, the exact missing dependency, and the independent work that can continue meanwhile.

## Open blockers

| ID | Affected items | Blocker | Independent work that can continue |
|---|---|---|---|
| BLK-001 | A01–A28, B10–B12, Q02–Q07, Q10 | No glasses hardware, evaluation boards, or BOM sourcing approval | Software interfaces, drivers abstraction, simulation |
| BLK-002 | M02–M07, M09–M10, I05 | Provider API keys and accounts are not provisioned. No credentials were created or requested in this repo | Provider-agnostic gateway with mocked providers in tests |
| BLK-003 | Q19, N20, N21 | Certification and legal compliance review require external parties | Documentation of requirements only |
| BLK-004 | Q20, Q21 | Real-world user trials and independent review need people and approvals outside this repo | None |
| BLK-005 | ChatGPT review loop | The ChatGPT review session is reachable in the browser, but whether it returns a usable approval for each item is not yet tested. Until a real review reply is received, reviews are INDEPENDENT_REVIEW_PENDING | Continue implementation; keep review status pending |
