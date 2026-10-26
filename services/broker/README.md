# LensMate provider broker

Fastify and PostgreSQL service that keeps provider credentials and spend enforcement outside the mobile app. The broker includes device enrolment and revocation, request quotas, model allowlists, privacy controls, a usage ledger, migrations, backup/restore tools, and unit and PostgreSQL integration tests.

## Local development

From the repository root, install the workspace and start the broker with the development environment file:

```sh
pnpm install
pnpm build
pnpm -F @lensmate/broker start
```

The broker defaults to mock mode; it does not make provider calls without explicit live-mode configuration. Local environment settings belong in the ignored root `.env.development`. Production settings belong in the ignored root `.env.production` or the production secret store. Do not commit either file or place secret values in documentation.

## Operations

Owner-controlled setup, deployment, credential files, backups, restore, and release prerequisites are documented in [`deploy/README.md`](deploy/README.md) and [`docs/deploy/hostinger-vps-runbook.md`](../../docs/deploy/hostinger-vps-runbook.md). The deployment files are prepared for review; local repository checks do not establish that the service is deployed or production-ready. The owner conditions for release are listed in [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md) (section E).
