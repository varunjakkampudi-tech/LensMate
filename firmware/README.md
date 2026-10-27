# Glasses firmware

This directory is reserved for device firmware written with ESP-IDF in C. No board-specific firmware is present yet.
Keep hardware-independent behavior in `packages/core`; add firmware here after selecting a board that can meet the
camera, audio, privacy-indicator, battery, and phone-link requirements in [`docs/hardware/glasses-spec.md`](../docs/hardware/glasses-spec.md).

The separate [`simulation/wokwi`](simulation/wokwi) experiment uses an Arduino sketch on a temporary ESP32 simulation
target to check basic Ask/Photo/mute and privacy-indicator control behavior before purchasing hardware. It is not
production firmware and does not select the final board. See [`docs/hardware/online-simulation.md`](../docs/hardware/online-simulation.md)
for browser instructions and the simulation's limits.
