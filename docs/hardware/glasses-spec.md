# LensMate glasses: product and link specification (draft 1)

Status: draft. Nothing here is built on hardware yet. The software side runs on the virtual glasses simulator
(`packages/simulator`), which uses the same `GlassesLink` interface and the same protocol that real glasses will use.

Owner: the LensMate owner (personal use for now). Reviewed by: nobody else yet.

## 1. Goal

A pair of glasses that does what the phone assistant does, hands-free, and does it better on the points in section 8.
Personal use first. No sale, no third-party access, until the owner decides otherwise.

## 2. What the glasses must do (Phase 1 prototype)

| Capability                 | Phase 1 (prototype)                 | Phase 2 (custom board)           |
| -------------------------- | ----------------------------------- | -------------------------------- |
| Camera photo on request    | Yes, one still at a time            | Yes, better sensor               |
| Microphone, push to talk   | Yes, one speaker                    | Yes, array with noise reduction  |
| Speaker or bone conduction | Optional (phone plays answers)      | Yes                              |
| Display                    | No (answers spoken or on the phone) | Yes, small monocular display     |
| Buttons                    | One button: press, hold, double tap | Same, plus a touch area          |
| Battery                    | Whatever the dev board allows       | At least a full day of mixed use |

## 3. Link between the glasses and the phone

- Transport: Bluetooth Low Energy, GATT service, one characteristic for app-to-glasses and one for glasses-to-app.
- Message format: the existing protobuf envelope in `packages/protocol/proto/lensmate/v1/link.proto`. The firmware uses
  nanopb (the same schema, compiled to C). Field numbers are never reused.
- Current message set: `Hello`, `ButtonEvent`, `IndicatorState`, `SessionState`, `Ack`.

### Missing from protocol v1 (must be added before real glasses can work)

1. **Photo transfer:** a header with size, format and a sequence count, then chunks. Chunks must be acknowledged, and a
   dropped chunk must be re-requested. Target: a 720p photo in under 3 seconds on a clean link.
2. **Audio transfer:** short audio chunks (16 kHz mono, about 100 ms each) from glasses to phone, with the same
   acknowledgement rule. Push-to-talk ends when the button is released or the user stops speaking.
3. **Battery:** level and charging state, sent every 60 seconds and on change.
4. **Display (Phase 2 only):** short text lines, with a clear-screen message.
5. **Firmware update:** a signed image, a version check, and a rollback path. Off by default until Phase 2.

New fields must use new numbers. Adding messages is allowed in v1 only if old readers can skip them (proto3 does this
for unknown fields). Anything that changes the meaning of an existing field needs `v2`.

## 4. Safety rules (not optional)

1. **Recording indicator.** Whenever the camera or microphone is in use, the glasses show a visible light, and the
   phone shows the same state. This is already in the protocol (`IndicatorState`, with a reason for each session).
   If the indicator cannot be shown, the camera and microphone do not start.
2. **No background capture.** Capture starts only after a button press or a tap on the phone. There is no always-on
   listening or always-on camera in Phase 1.
3. **Pairing.** Glasses and phone pair once, with a code shown on the phone and entered or confirmed on the phone.
   After pairing, each session is authenticated. The protocol already has `NOT_AUTHENTICATED` and `REPLAYED` error codes,
   which must be enforced in firmware.
4. **Local first.** Photos and audio are processed on the phone. A photo or audio clip leaves the phone only for the
   AI request the owner started, and it goes through the broker with the existing spend cap and zero-retention rule.
5. **People in view.** The app must not identify people from the camera. Face recognition is out of scope.
6. **Stored media.** Photos and audio are kept only when the owner saves them. Unsaved media is deleted when the session
   ends.

## 5. Phone app behaviour (already partly built)

- The glasses link is the `GlassesLink` interface in `packages/core`. The app talks to it through `useGlasses()`.
- Today `createVirtualGlasses()` is the only implementation. A BLE implementation is added behind the same interface.
  It needs a native build and a real device, so it is tested on the phone, not in unit tests.
- The header pill, Home, and the simulator already read the same link state.

## 6. What the software can test without hardware

- Protocol round trips (encode, decode, unknown fields, wrong version): tested in `packages/protocol`.
- Session start, indicator on and off, capture refused without the indicator: tested with the virtual glasses.
- Photo and audio chunking, loss and re-request: to be tested with a fake link that drops chunks.

## 7. Hardware path

1. **Prototype kit:** a development board with a camera and microphone, a small battery, and a Bluetooth module.
   The first choice is an ESP32-S3 camera board. Confirm the module, its radio certification and its power draw before buying.
2. **Frame:** a 3D-printed frame that holds the board, the battery and the button. Test comfort on the owner's face for
   at least four hours before any design change.
3. **Custom board:** an electronics engineer designs the board from the Phase 1 results. Certification (BIS for India,
   FCC or CE for export) comes before any sale. Personal use in India still needs the radio to be legal.
4. **Display and speaker:** added in Phase 2 after the link works end to end.

## 8. "Better than JARVIS": measurable targets

A target is only real when it is measured on the device. Each row is a number the owner can check.

| Target                                  | Measure                                                       | Status                                      |
| --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| Time from question to first spoken word | Median over 20 questions on the phone                         | Not measured                                |
| Stop command ends speech                | `Last stop` on the Diagnostics screen, median under 300 ms    | Measured in code, not on a device           |
| Photo question answered                 | Photo captured, answer shown, under 6 seconds                 | Not measured                                |
| Indicator on for every capture          | Count of capture sessions without the indicator, must be zero | Enforced in code, tested with the simulator |
| Nothing captured without a tap          | Count of background captures, must be zero                    | Enforced in code                            |
| Glasses battery                         | Hours of mixed use, target at least 8 in Phase 2              | Not started                                 |
| Memory recall                           | Correct answers to 20 saved-note questions                    | Not measured                                |
| Comfort                                 | Owner wears it for 4 hours without changing the frame         | Not started                                 |

## 9. Open decisions for the owner

1. Phase 1 board: approve the ESP32-S3 camera board as the first prototype.
2. Whether a hardware engineer is hired now or after the Phase 1 prototype works.
3. Whether the owner wants a speaker in Phase 1, or the phone to play all answers.
4. The spend cap for the broker. The current INR 500 a month limits how much AI the glasses can use.

## 10. Direction: glasses first, then the phone, with continuous updates

Owner direction: the AI glasses are the main product. The phone app supports them and is updated alongside them.

### 10.1 Where the intelligence lives

- **Glasses firmware stays small and fixed in purpose:** capture a photo, record audio, drive the light and the button,
  report battery, and talk over Bluetooth. It does not decide what to do with a photo or a question.
- **The phone app does the thinking:** it decides what to ask, shows results, and runs routines.
- **The broker does the AI calls** with the spend cap and zero-retention rule.

Because features live in the phone app and the broker, most new features reach the glasses without a firmware change.

### 10.2 Continuous updates

| What changes | How it reaches the owner | Risk control |
|---|---|---|
| Phone app features | Web build now, Android development build, later an over-the-air update (Expo Updates) | Every release passes CI on `dev`; `main` only after owner approval |
| Broker and AI behaviour | Server deploy after CI and approval | Spend cap, audit log, rollback to the previous image |
| Glasses firmware | Signed firmware image sent over Bluetooth, with a version check | A failed update keeps the old firmware; a new version is first tested on one pair of glasses |
| Glasses protocol | New message numbers only; old readers skip unknown fields | The protocol version is checked on every connection |

### 10.3 Build order

1. **Glasses link on a development board:** capture, microphone, light and button, reported to the phone over Bluetooth.
   Test: a photo arrives on the phone, the light is on during every capture, and a question can be asked by voice.
2. **Glasses link in the app:** a real Bluetooth link behind the existing `GlassesLink` interface, tested on the Android phone.
3. **Protocol additions** from section 3: photo and audio transfer, battery, and signed firmware updates.
4. **Glasses comfort and battery:** a 3D-printed frame, worn for four hours, with battery life measured.
5. **Custom board** once the development-board version works end to end.
6. **Phone features added continuously** against the same protocol, with the glasses as the main input.

### 10.4 Decisions needed to start step 1

- Approve purchase of a camera and microphone development board, after the exact model and total are confirmed.
- Approve the firmware toolchain install on this PC (ESP-IDF, the standard Espressif environment).
- Choose the phone for the first glasses link test: the Android phone you are getting.
