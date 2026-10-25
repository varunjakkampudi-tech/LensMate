# LensMate software

LensMate is a TypeScript monorepo for an Expo companion app, its shared domain and protocol packages, a virtual glasses simulator, and a server-side provider broker. The repository also contains Maestro flow definitions, ESP-IDF project guidance, deployment procedures, product and test matrices, and decision records.

## Repository map

| Path                       | Purpose                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `apps/mobile`              | Expo app for iOS, Android, and web; app screens, device integrations, and mobile tests |
| `packages/core`            | Shared domain logic, provider gateway, measurements, privacy and retention helpers     |
| `packages/protocol`        | Versioned Protocol Buffers schema and codec                                            |
| `services/broker`          | Fastify/PostgreSQL provider broker, tests, and owner-operated deployment files         |
| `tools/simulator`          | Virtual glasses implementation used by the app and tests                               |
| `tools/measurement-import` | Measurement CSV validation and import CLI                                              |
| `tools/readiness`          | Generates the app readiness registry from `FEATURE_MATRIX.md`                          |
| `firmware`                 | ESP-IDF implementation guidance; hardware work remains gated by owner approval         |
| `e2e/maestro`              | Authored Maestro flows; execution status is tracked separately                         |
| `docs`                     | Architecture, decisions, governance, investigations, reviews, and runbooks             |

See [`PROGRESS.md`](PROGRESS.md), [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md), [`GAP_MATRIX.md`](GAP_MATRIX.md), and [`TEST_MATRIX.md`](TEST_MATRIX.md) for dated implementation status and evidence.

## Requirements and setup

- Node.js 22 or later
- The pnpm release specified by `packageManager` in the root `package.json`
- For app development, install dependencies and configure the local root `.env.development` file

The root `.env.development` and `.env.production` files are local-only and ignored by Git. Keep credentials in those files or the deployment secret store; never add environment files or secret values to commits. The app config copies only `EXPO_PUBLIC_*` values from development settings into Expo's public app environment. Production deployment setup is documented in [`services/broker/deploy/README.md`](services/broker/deploy/README.md).

```sh
pnpm install
pnpm -F @lensmate/mobile start
```

## Quality commands

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm knip
pnpm build
pnpm check:schema
pnpm check:expo
```

`pnpm format` applies the repository Prettier configuration. Review its diff before committing. The Expo app is linted with ESLint's non-type-aware rules and checked by its strict TypeScript project; other TypeScript workspaces use the configured type-aware ESLint rules.

## Development rules

- Do all development on `dev`; production changes to `main` require owner approval. See [`docs/governance/git-branch-policy.md`](docs/governance/git-branch-policy.md).
- Do not commit secrets, environment files, credentials, recordings, photos, or personal data.
- Treat owner decisions and open blockers in [`blocker.txt`](blocker.txt) as release controls.
- Do not infer hardware, provider, emulator, or production readiness from local unit checks.
