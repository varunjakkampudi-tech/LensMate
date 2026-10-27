# LensMate glasses and phone link

## Product behavior

LensMate is a pair of personal AI glasses with a phone companion. The glasses capture high-quality photos and video, hear
the owner's questions, and deliver spoken answers. The phone provides private storage and the owner's editable memory.

Capture must always be intentional. The glasses must turn on a visible recording light before the camera or microphone
starts and refuse capture if the light cannot be confirmed. The phone must show the same active-capture state. There is
no background camera or microphone use. LensMate does not identify people in view.

## Device and data boundary

- The glasses handle the camera, microphone, speaker, physical controls, recording light, and secure communication with
  the phone.
- The phone is the owner's trusted companion: it authenticates the glasses, stores saved media and personal memory in
  encrypted local storage, and coordinates AI requests.
- The broker relays AI requests so provider credentials and spend controls stay off the device. Media leaves the phone
  only for an AI request the owner starts and only under the approved provider privacy settings.
- Do not retain unsaved media after its capture session ends. The owner must be able to inspect, export, and delete saved
  information.

## Current implementation status

The app currently uses the virtual device implementation in `tools/simulator`. The app has no real glasses firmware or
Bluetooth/Wi-Fi transport. The protocol in `packages/protocol/proto/lensmate/v1/link.proto` covers device identity,
button events, capture indicators, sessions, and acknowledgements; it does not transfer image, video, or audio data.
The phone can capture and ask about a photo using its own camera, but does not yet receive media from glasses or persist
glasses captures.

Treat these as gaps, not as supported hardware behavior. Select and validate the camera, compute platform, radio, battery,
and frame before committing to hardware-specific resolution, video mode, wireless transport, or runtime claims.

## Current engineering objective: still photo to phone

Implement one complete real-device flow:

1. The owner triggers a photo from a physical control or explicit phone action.
2. The glasses confirm the recording light is on before capture.
3. The camera captures at the chosen sensor's native still-image resolution without an unnecessary quality-reducing
   re-encode.
4. The glasses transfer the image reliably to the authenticated paired phone, with integrity checks and safe recovery
   after interruption.
5. The phone stores the image in encrypted local storage and reports success only after the saved file is readable.

Before stating a resolution or capture-time target, measure the selected hardware and end-to-end transfer under repeatable
conditions. The simulator may exercise protocol behavior, but cannot establish image quality, latency, radio reliability,
battery life, or wearer comfort.

## Link and protocol requirements

- A paired device must authenticate each connection and reject replayed or unauthenticated commands.
- Control messages and media transport must be designed for the selected hardware and phone platforms; do not assume
  Bluetooth Low Energy is suitable for high-resolution media payloads.
- Media transfers need explicit metadata, bounded chunks, integrity verification, acknowledgements, retry/resume behavior,
  cancellation, and resource limits.
- Protocol fields are never reused. Any incompatible change receives a new protocol version.
- A failed or interrupted transfer must leave no partial media presented as a successful capture.

## Validation evidence

Use the shared `GlassesLink` contract and virtual glasses for deterministic software checks. Hardware claims require a real
glasses prototype and paired target phone. Record the device model, camera settings, lighting, file dimensions and size,
transfer duration, integrity result, storage result, and any failure. Report direct device evidence separately from
software checks.
