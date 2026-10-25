# BLOCKER-010 dependency audit evidence

Audit date: 2026-10-26
Audit base: origin/dev at 865f2040e5d3b6be78c2ab424509064fbd39c03e

## Install and scope

- Command: pnpm install --frozen-lockfile
- Result: exit 0; lockfile was reported up to date; 991 packages reused from the local pnpm store, zero downloaded; completed in 3m 29.2s.
- The install did not edit pnpm-lock.yaml. No override, waiver, or dependency change was made.

## Audit result

- pnpm audit --audit-level=high: exit 1; 1 high advisory.
- pnpm audit --prod --audit-level=high: exit 1; the same advisory, with 99 production-reachable dependency paths.
- pnpm audit --dev --audit-level=high: exit 0; No known vulnerabilities found.
- Full audit JSON metadata: 782 dependencies, 243 devDependencies, 122 optionalDependencies, 1104 total dependencies.

### GHSA-86w9-cpqp-85rv (npm advisory 1240912)

- Severity: high; CWE-347.
- Title: node-forge RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm elements.
- Package and resolved version: node-forge 1.4.0.
- Vulnerable range: <=1.4.0.
- Patched version: none reported by pnpm audit (patched_versions is null).
- Registry check: pnpm view node-forge version returned 1.4.0; pnpm view node-forge versions --json ended at 1.4.0. No patched version is currently published in the queried registry; 1.4.0 remains in the vulnerable range.
- Advisory: https://github.com/advisories/GHSA-86w9-cpqp-85rv

Affected environment: build/CLI tooling is confirmed. The resolved package manifests show node-forge as a dependency of @expo/cli and @expo/code-signing-certificates. @expo/cli exposes the expo-internal CLI binary; expo-updates imports @expo/code-signing-certificates from its cli/ code-signing helpers. This source inspection found no runtime app-bundle import of node-forge. pnpm nevertheless reports 99 production-reachable paths because Expo packages reachable from apps/mobile depend on the CLI/signing graph. A release-bundle analysis was not performed, so runtime bundling is not claimed.

The full pnpm audit JSON reports 100 exact paths. The production-filtered report contains 99; the single dev-only path is marked below. Each path is listed once:

- apps__mobile>expo-dev-client>expo-dev-menu-interface>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-dev-client>expo-dev-menu-interface>expo>@expo/cli>node-forge
- apps__mobile>expo-dev-client>expo-updates-interface>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-dev-client>expo-updates-interface>expo>@expo/cli>node-forge
- apps__mobile>expo-dev-client>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-dev-client>expo>@expo/cli>node-forge
- apps__mobile>expo-dev-client>expo-dev-launcher>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-dev-client>expo-dev-launcher>expo>@expo/cli>node-forge
- apps__mobile>expo-dev-client>expo-dev-launcher>expo-dev-menu>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-dev-client>expo-dev-launcher>expo-dev-menu>expo>@expo/cli>node-forge
- apps__mobile>expo-dev-client>expo-dev-launcher>expo-dev-menu>expo-dev-menu-interface>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-dev-client>expo-dev-launcher>expo-dev-menu>expo-dev-menu-interface>expo>@expo/cli>node-forge
- apps__mobile>expo-dev-client>expo-dev-launcher>expo-manifests>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-dev-client>expo-dev-launcher>expo-manifests>expo>@expo/cli>node-forge
- apps__mobile>expo-dev-client>expo-dev-menu>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-dev-client>expo-dev-menu>expo>@expo/cli>node-forge
- apps__mobile>expo-dev-client>expo-dev-menu>expo-dev-menu-interface>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-dev-client>expo-dev-menu>expo-dev-menu-interface>expo>@expo/cli>node-forge
- apps__mobile>expo-dev-client>expo-manifests>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-dev-client>expo-manifests>expo>@expo/cli>node-forge
- apps__mobile>expo-secure-store>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-secure-store>expo>@expo/cli>node-forge
- apps__mobile>expo-constants>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-constants>expo>@expo/cli>node-forge
- apps__mobile>expo-updates>expo-updates-interface>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo-updates-interface>expo>@expo/cli>node-forge
- apps__mobile>expo-updates>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo>@expo/cli>node-forge
- apps__mobile>expo-updates>expo-manifests>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo-manifests>expo>@expo/cli>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-menu-interface>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-menu-interface>expo>@expo/cli>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-updates-interface>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-updates-interface>expo>@expo/cli>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo>@expo/cli>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-launcher>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-launcher>expo>@expo/cli>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-launcher>expo-dev-menu>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-launcher>expo-dev-menu>expo>@expo/cli>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-launcher>expo-dev-menu>expo-dev-menu-interface>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-launcher>expo-dev-menu>expo-dev-menu-interface>expo>@expo/cli>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-launcher>expo-manifests>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-launcher>expo-manifests>expo>@expo/cli>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-menu>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-menu>expo>@expo/cli>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-menu>expo-dev-menu-interface>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-dev-menu>expo-dev-menu-interface>expo>@expo/cli>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-manifests>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-updates>expo-dev-client>expo-manifests>expo>@expo/cli>node-forge
- apps__mobile>expo-speech>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-speech>expo>@expo/cli>node-forge
- apps__mobile>expo-linking>expo-constants>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-linking>expo-constants>expo>@expo/cli>node-forge
- apps__mobile>expo-linking>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-linking>expo>@expo/cli>node-forge
- apps__mobile>expo-notifications>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-notifications>expo>@expo/cli>node-forge
- apps__mobile>expo-notifications>expo-constants>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-notifications>expo-constants>expo>@expo/cli>node-forge
- apps__mobile>expo-notifications>expo-application>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-notifications>expo-application>expo>@expo/cli>node-forge
- apps__mobile>expo-router>expo-glass-effect>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-router>expo-glass-effect>expo>@expo/cli>node-forge
- apps__mobile>expo-router>@expo/log-box>@expo/dom-webview>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-router>@expo/log-box>@expo/dom-webview>expo>@expo/cli>node-forge
- apps__mobile>expo-router>@expo/log-box>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-router>@expo/log-box>expo>@expo/cli>node-forge
- apps__mobile>expo-router>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-router>expo>@expo/cli>node-forge
- apps__mobile>expo-router>expo-constants>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-router>expo-constants>expo>@expo/cli>node-forge
- apps__mobile>expo-router>expo-linking>expo-constants>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-router>expo-linking>expo-constants>expo>@expo/cli>node-forge
- apps__mobile>expo-router>expo-linking>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-router>expo-linking>expo>@expo/cli>node-forge
- apps__mobile>expo-router>@expo/metro-runtime>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-router>@expo/metro-runtime>expo>@expo/cli>node-forge
- apps__mobile>expo-router>@expo/metro-runtime>@expo/log-box>@expo/dom-webview>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-router>@expo/metro-runtime>@expo/log-box>@expo/dom-webview>expo>@expo/cli>node-forge
- apps__mobile>expo-router>@expo/metro-runtime>@expo/log-box>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-router>@expo/metro-runtime>@expo/log-box>expo>@expo/cli>node-forge
- apps__mobile>expo-sqlite>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-sqlite>expo>@expo/cli>node-forge
- apps__mobile>expo-image-manipulator>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-image-manipulator>expo>@expo/cli>node-forge
- apps__mobile>expo-image-manipulator>expo-image-loader>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-image-manipulator>expo-image-loader>expo>@expo/cli>node-forge
- apps__mobile>expo-speech-recognition>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-speech-recognition>expo>@expo/cli>node-forge
- apps__mobile>expo-image-picker>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-image-picker>expo>@expo/cli>node-forge
- apps__mobile>expo-image-picker>expo-image-loader>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-image-picker>expo-image-loader>expo>@expo/cli>node-forge
- apps__mobile>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo>@expo/cli>node-forge
- apps__mobile>expo-camera>expo>@expo/cli>@expo/code-signing-certificates>node-forge
- apps__mobile>expo-camera>expo>@expo/cli>node-forge
- [dev-only] apps__mobile>jest-expo>expo>@expo/cli>@expo/code-signing-certificates>node-forge

## BLOCKER-006 local Compose validation

From services/broker/deploy in the detached 865f204 worktree, docker compose config exited 1. Exact output:

    error while interpolating services.broker.environment.BROKER_FX_PAISE_PER_USD: required variable BROKER_FX_PAISE_PER_USD is missing a value: set the owner exchange-rate setting
    error while interpolating services.broker.environment.BROKER_MONTHLY_CAP_PAISE: required variable BROKER_MONTHLY_CAP_PAISE is missing a value: set the owner-confirmed cap in paise

No values were invented for these owner-controlled settings. No image build, container start, provider-key use, or remote-host operation was performed.

## Review status

Prepared for independent Claude review. No advisory was waived or fixed in this investigation.
