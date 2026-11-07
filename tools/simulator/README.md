# Virtual glasses simulator

Deterministic in-process virtual glasses implementation used by the mobile app and tests. It implements the shared GlassesLink contract, supports connection and session events, and runs without Bluetooth hardware or a network service.

The simulator is a development and test tool; it is not evidence of real-device or firmware behavior. Its implementation and tests are under `src/`. The app's user-facing simulator route is `apps/mobile/app/simulator.tsx`.
