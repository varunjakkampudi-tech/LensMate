# PROGRESS

Owner approval: OWNER-APPROVAL-001 in `blocker.txt` (RESOLVED, 2026-10-20). Goal is ACTIVE. Direct commits to `main` are allowed under the four conditions in that entry.

## Stage A — Foundations (in progress)

| Item | Requirement | Status | Evidence |
|---|---|---|---|
| Monorepo skeleton (pnpm workspace, strict TypeScript base) | G46, Standards 1 | Implemented | `pnpm typecheck` and `pnpm build` pass locally (Node 22.23.2, pnpm 12.5.1) |
| `.gitignore` for secrets, recordings, agent material | Engineering Standards 5, public-repo rules | Implemented | File present; not yet exercised by a CI artifact check |
| Secret scan (tree and history) | Standards 5, Global 22 | Implemented, CI pending | Workflow `secret-scan` uses gitleaks action; first run not yet observed |
| Typecheck and build CI on push | Goal 16B.2 | Implemented, CI pending | Workflow `typecheck` |
| `packages/core` placeholder | G46 | Implemented (placeholder only) | No domain logic yet |
| Unit test infrastructure (Jest) | Standards 7.1 | NOT STARTED | Next slice |
| ESLint, Prettier, knip | Standards 7.4 | NOT STARTED | Next slice |
| `packages/protocol` (Protocol Buffers schema) | G46 | NOT STARTED | Stage A |
| `GlassesLink` interface and virtual glasses simulator | Goal 7 Stage A | NOT STARTED | Stage A |
| Expo app skeleton (`apps/mobile`) | G46 | NOT STARTED | Needs pinned Expo SDK decision |
| Broker (`services/broker`) | Goal 10A.3 | NOT STARTED | Stage C |
| Firmware abstractions | Goal 7 Stage J | NOT STARTED | Stage J |

## Checklist

All 54 v9 checklist items are NOT_DUE or not yet assessed. Status per item is recorded when its stage starts. No item is marked passed.

## Deviations and open points

- `pnpm` version: `package.json` declares `pnpm@10.0.0`, but the local tool reports 12.5.1. The lockfile format was produced by the local version; the declared version and the lockfile need to be reconciled before the next CI run is trusted.
- Actions are pinned to commit SHAs resolved from the release tags on the day of this change.
