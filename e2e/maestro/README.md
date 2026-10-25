# Maestro flows (Android emulator)

**Status: these flows have NOT been run.** This machine has no Android emulator, and the flows have not been run
against a build of the app anywhere. They were checked only for YAML syntax and for the texts they match against
the relevant mobile sources: `apps/mobile/src/strings.ts`, `apps/mobile/app/*.tsx`, and
`apps/mobile/src/demo/demo-strings.ts`. The first real run is an owner decision (see below).

## Flows

- `home-and-enrolment.yaml` (flow A): launches the app, checks the title "LensMate", the status "Not connected" and
  the "Connect virtual glasses" control, opens "Enrol this phone", checks the message "The broker address is not set
  in this build, so enrolment is unavailable.", and goes back with "Back to home".
- `measurement.yaml` (flow B): opens "Open measurement screen", checks the "Measurement" and "Session" headings,
  scrolls to "Back to home" and goes back.
- `onboarding-to-assistant.yaml` (flow C): accepts the first-run cloud notice and reaches the Assistant screen.
- `virtual-glasses-capture-and-ask.yaml` (flow D): uses the synthetic virtual-glasses demo to capture a scene, ask a
  question and check the canned mock answer.
- `privacy-indicator-session.yaml` (flow E): starts a synthetic translation session and checks that the microphone
  recording indicator remains visible.

**Evidence level: all flows are NOT RUN.** Emulator and simulator jobs are blocked on BLOCKER-009. Each flow file
contains its exact command; from the repository root, they are:

```sh
maestro test e2e/maestro/onboarding-to-assistant.yaml
maestro test e2e/maestro/virtual-glasses-capture-and-ask.yaml
maestro test e2e/maestro/privacy-indicator-session.yaml
```

The flows use only visible app text from `apps/mobile/src/strings.ts` and `apps/mobile/app/*.tsx`, plus the synthetic
demo strings in `apps/mobile/src/demo/demo-strings.ts`. They contain no broker address, keys or secrets.

## Required environment

- Android emulator image: Google APIs (`google_apis`), `x86_64`, **API level 34**, device profile `pixel_6`.
- Host: Linux with KVM (the workflow enables it), or Android Studio on a machine that can run an x86_64 emulator.
- Maestro CLI: `cli-2.11.0` (released 2026-09-29). Maestro needs a Java runtime on the PATH.
- A **debug build of the app with no `EXPO_PUBLIC_BROKER_BASE_URL`**. Flow A fails if a broker address is set,
  because the enrolment screen then shows the form instead of the "not configured" message.
- The build must open the app without a running Metro dev server. An Expo dev-client build that waits for a dev
  server will not match the flows. No such build has been produced or verified for this repository.

## Commands

Run from the repository root, after the emulator is booted and the debug build is installed:

```sh
adb install -r path/to/lensmate-debug.apk
maestro test e2e/maestro
```

Run one flow with `maestro test e2e/maestro/measurement.yaml`.

## Owner steps before the workflow runs

The workflow `.github/workflows/e2e-android.yml` is manual only (`workflow_dispatch`). Before anyone starts it:

1. Check the GitHub Actions minutes for this account (BLOCKER-009). The emulator job uses KVM and is much slower
   than the existing CI jobs.
2. Approve a debug build path. The workflow's first step fails on purpose until that is done. The build must need no
   EAS account and no signing secrets, and must leave the broker address unset.
3. Start the workflow with "Run workflow" on the chosen branch. Nothing starts it automatically.
