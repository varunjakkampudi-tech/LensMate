# AI Smart Glasses — software track

Monorepo for the smart glasses software: Expo companion app, protocol schema, core domain logic, provider broker, virtual glasses simulator, ESP-IDF firmware, end-to-end tests and documentation.

## Layout

| Path                | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `apps/mobile`       | Expo app (iOS and Android)                           |
| `packages/core`     | Pure TypeScript domain logic                         |
| `packages/protocol` | Versioned Protocol Buffers schema (planned)          |
| `services/broker`   | Server-side provider broker (planned)                |
| `tools/simulator`   | Virtual glasses (planned)                            |
| `firmware`          | ESP-IDF firmware (planned, host-testable parts only) |
| `e2e`               | Maestro flows (planned)                              |
| `docs`              | Architecture, decisions, runbooks                    |

## Commands

```bash
pnpm install
pnpm typecheck
```

Requires Node.js 22 or later and the pnpm version in `packageManager`.

## Rules

- Never commit secrets, keys, `.env` files, recordings, photos or personal data.
- Never commit repository names or links into documents or commit messages.
- Owner approvals are recorded in `blocker.txt`; agents do not edit approved entries.

Status and evidence: see `PROGRESS.md`.
