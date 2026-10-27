# Documentation

## Product and device

- [Product contract](product/PRODUCT.md): scope, privacy rules, current implementation, and the current engineering objective.
- [Glasses and phone link](hardware/glasses-spec.md): capture safety, device boundaries, protocol requirements, and validation.
- [Online hardware simulation](hardware/online-simulation.md): Wokwi control-circuit experiment, browser steps, and evidence limits.

## Architecture and privacy

- [Architecture decisions](architecture/adr-0001-expo-sdk-version.md)
- [Native speech and storage](decisions/0001-native-speech-and-storage.md)
- [Backup recovery](decisions/0002-backup-recovery-after-revocation.md)
- [Broker route](decisions/0003-iphone-broker-https-route.md)
- [Assistant cancellation](decisions/0004-assistant-cancellation.md)
- [Provider privacy and models](governance/provider-privacy-and-models.md)
- [Dependency risk exception](governance/RISK_EXCEPTIONS.md): dated acceptance and recheck date for the one audit exclusion.
- [Branch policy](governance/git-branch-policy.md)

## Development and operations

- [Broker development](../services/broker/README.md)
- [Broker deployment](deploy/hostinger-vps-runbook.md)
- [Broker backup and restore](../services/broker/deploy/README.md)
- [Local development and test commands](../README.md)

Only retain documentation that supports the product contract, security, implementation, or operation. Record device
validation alongside the specific feature evidence; do not maintain parallel progress or readiness scorecards.
