# Online hardware simulation

LensMate uses two separate simulators:

- The app's virtual glasses simulator exercises LensMate software behavior and UI.
- The Wokwi circuit in [`firmware/simulation/wokwi`](../../firmware/simulation/wokwi) exercises a small candidate-board control circuit.

The Wokwi experiment uses a simulated ESP32 DevKitC V4, Ask and Photo buttons, a physical-mute switch, a privacy LED, and a buzzer. The board is a temporary simulation target, not a selected LensMate production board. The sketch prints explicit `SIM:` events so button, mute, and indicator behavior can be observed in the serial monitor. The buzzer is a stand-in for an output signal; it does not model glasses audio.

## Run it in the browser

1. Open [Wokwi's ESP32 project editor](https://wokwi.com/projects/new/esp32).
2. Replace `sketch.ino` with the repository's `firmware/simulation/wokwi/sketch.ino`.
3. Replace `diagram.json` with the repository's `firmware/simulation/wokwi/diagram.json`.
4. Start the simulation. Press **Ask** and check that `SIM:VOICE_REQUEST_STARTED` appears and the red privacy LED turns on. Press **Ask** again; the request stops and the simulated answer-route limitation is printed.
5. Toggle **Mute** and press **Ask**. The log should report `SIM:ASK_BLOCKED_MIC_MUTED`. Starting a voice request and then enabling mute should stop it.
6. Press **Photo**. The log explicitly says no camera is attached; the privacy LED lights for the simulated capture interval.

Saving or sharing a persistent Wokwi project may require a Wokwi account. The circuit files remain in this repository either way. Do not enter LensMate credentials, provider keys, personal media, or private user data in Wokwi. A future Wokwi CLI/CI integration would require evaluating its account, token, cloud, privacy, and usage-quota requirements first.

## What this can and cannot establish

This experiment can check the simple control state machine, button wiring, mute gating, serial events, and the software command that drives a privacy LED. Wokwi supports ESP32 boards and common parts such as buttons, switches, LEDs, and buzzers. Its documented simulator does not model this project's actual camera, high-resolution still/video path, I2S on ESP32, Bluetooth, production glasses-to-phone transport, or the electrical behavior of a final custom board.

It cannot establish image or audio quality, speech recognition, battery life, power safety, thermal behavior, radio reliability, end-to-end phone integration, recording-indicator visibility in real conditions, or wearer comfort. Treat every result as software/circuit simulation evidence only. Complete those checks on a real, safely assembled prototype before making hardware claims or selecting production components.

The camera board, compute platform, radio, battery, display, and frame remain unselected. Do not buy components for this temporary simulation target as though they form the final glasses. The existing app virtual-device simulator remains the place to validate mobile UI and app-side software flows.
