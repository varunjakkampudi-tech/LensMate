# Glasses firmware

This directory is reserved for device firmware written with ESP-IDF in C. No board-specific firmware is present yet.
Keep hardware-independent behavior in `packages/core`; add firmware here after selecting a board that can meet the
camera, audio, privacy-indicator, battery, and phone-link requirements in [`docs/hardware/glasses-spec.md`](../docs/hardware/glasses-spec.md).
