# Android Maestro flows

These flows exercise the phone app using a local Android development build. They are not executed by the default quality
workflow. A flow is verified only when it completes against the stated build and device configuration.

## Run a flow

1. Start an Android emulator or connect a test phone.
2. Install and launch the current LensMate development build.
3. From the repository root, run `maestro test e2e/maestro/<flow>.yaml`.
4. Record the app commit, device or emulator image, flow, outcome, and any failure with the change being reviewed.

Flows that depend on broker enrollment or live AI require the appropriate local test setup. Do not use a production
credential or enable paid calls for an emulator run. A virtual glasses flow validates app behavior only; it does not
validate physical capture, media transfer, image quality, or battery life.
