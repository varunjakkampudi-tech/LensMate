# Documentation index

## Architecture and decisions

- [Expo SDK version ADR](architecture/adr-0001-expo-sdk-version.md)
- [Native speech and storage](decisions/0001-native-speech-and-storage.md)
- [Backup recovery after revocation](decisions/0002-backup-recovery-after-revocation.md)
- [iPhone broker HTTPS route](decisions/0003-iphone-broker-https-route.md)
- [Assistant cancellation](decisions/0004-assistant-cancellation.md)

## Governance and provider use

- [Git branch policy](governance/git-branch-policy.md): development on `dev`; production promotion to `main` requires owner approval.
- [Provider privacy and models](governance/provider-privacy-and-models.md): approved data handling, model and cost notes, and unresolved owner conditions.

## Operations and evidence

- [Broker VPS deployment runbook](deploy/hostinger-vps-runbook.md)
- [Broker deployment and backup instructions](../services/broker/deploy/README.md)
- [Measurement procedures and evidence template](measurements/README.md)
- [Measurement traceability](measurements/traceability.md)
- [Blocker 010 dependency audit](investigations/blocker-010-audit.md)
- [Broker local test failures](investigations/broker-local-test-failures.md)
- [AI memory review](reviews/2026-10-24-ai-memory-review.md)
- [Assistant and Home accessibility audit](ui-audit/assistant-home-a11y.md)

Implementation status and verification evidence are maintained in [`PROGRESS.md`](../PROGRESS.md), [`blocker.txt`](../blocker.txt), and the root feature, gap, screen, and test matrices.
