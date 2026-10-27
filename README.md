# LensMate software

LensMate is a TypeScript monorepo for personal AI glasses and their phone companion. It contains the Expo mobile app, shared device protocol and domain packages, a virtual glasses simulator, and a server-side AI broker. The current glasses-to-phone media path is not implemented yet.

## Repository map

| Path                | Purpose                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `apps/mobile`       | Expo phone companion, device integration boundary, and mobile tests        |
| `packages/core`     | Shared device behavior, provider gateway, privacy, and retention rules     |
| `packages/protocol` | Versioned glasses-to-phone protocol and codec                              |
| `services/broker`   | Authenticated AI relay, privacy and spend safeguards                       |
| `tools/simulator`   | Virtual glasses implementation for deterministic app and protocol checks   |
| `firmware`          | Firmware guidance and a separate Wokwi control-circuit experiment           |
| `docs`              | Product contract, hardware, architecture, security decisions, and runbooks |

The product contract and current engineering objective are in [`docs/product/PRODUCT.md`](docs/product/PRODUCT.md). The glasses and phone link requirements are in [`docs/hardware/glasses-spec.md`](docs/hardware/glasses-spec.md).
The browser-based circuit experiment and its limits are documented in [`docs/hardware/online-simulation.md`](docs/hardware/online-simulation.md).

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
- Treat the product rules in [`docs/product/PRODUCT.md`](docs/product/PRODUCT.md) as scope controls.
- Do not infer hardware, provider, emulator, or production readiness from local unit checks.
