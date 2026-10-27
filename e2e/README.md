# End-to-end flows

Maestro flows in `maestro/` cover the mobile app's capture, assistant, memory, privacy, and enrollment paths. They are
authored scenarios; they count as execution evidence only after they are run against an installed Android build.

Use the app's documented local setup in [the mobile README](../apps/mobile/README.md), then follow
[`maestro/README.md`](maestro/README.md) to run a flow. Record failures against the affected change. Simulator flows do
not establish glasses hardware quality, wireless transfer, or battery performance.
