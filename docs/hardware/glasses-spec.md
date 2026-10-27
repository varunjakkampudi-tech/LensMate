# LensMate glasses and phone link

## Product behavior

LensMate glasses are the wearer's primary voice and camera interface, with a paired phone for connectivity, controls,
encrypted storage, and service integrations. The wearer should be able to ask a question or give a task naturally, hear
the answer through the glasses, capture high-quality photos and video on command, and retrieve private personal memory.
The product may also offer a wearer-started conversation-assistance mode and consent-based reminders about people the
wearer explicitly asks LensMate to remember. These are future capabilities, not implemented hardware behavior.

The wearer explicitly enables any local wake-word listener or conversation-assistance mode. Hardware must make
microphone states obvious and distinct: local wake detection, wearer-requested audio capture/transmission, and an active
conversation-assistance session. Wake detection runs locally and may use only a short, bounded volatile audio window;
the window is immediately discarded when no wake word is detected. A physical mute control stops microphone input and
clears the window. A conversation-assistance session is wearer-started, defaults to local processing, and has a separate
visible indicator. It keeps no raw audio or transcripts by default. Cloud processing requires a separate opt-in for that
session. Alerts go only to the wearer through a private audio route or haptic. Camera capture and video recording always
start from a deliberate wearer command or control, with the physical recording light confirmed on before capture. If
an indicator cannot be confirmed, the device refuses to capture.

Person reminders require the person's informed enrollment, must support revocation and deletion of the face template and
linked notes, and must be performed on-device if implemented. Use confidence thresholds and ask the wearer when identity
is uncertain. Never identify unenrolled bystanders or speak a saved person's private details to that person. The phone
must show the wearer when camera or conversation-assistance capture is active.

## Device and data boundary

- Glasses provide the camera, microphone, speaker, physical controls, mute control, privacy indicators, and secure
  communication with the phone.
- The phone authenticates the glasses, stores owner-approved media and personal memory in encrypted local storage,
  coordinates AI requests, and hosts future service connections under phone permissions.
- The glasses are where answers are heard. The phone and broker may relay requests when the selected glasses hardware
  cannot run the required model locally; provider credentials and spend controls stay off the glasses and app.
- Only send media or audio needed for a wearer-started request, under the approved privacy settings. Do not retain
  unsaved media or ambient conversations by default. The owner must be able to inspect, export, edit, and delete saved
  information.

## Current implementation status

The app currently uses the virtual device implementation in `tools/simulator`. The app has no real glasses firmware or
Bluetooth/Wi-Fi transport. The protocol in `packages/protocol/proto/lensmate/v1/link.proto` covers device identity,
button events, capture indicators, sessions, and acknowledgements; it does not transfer image, video, or audio data.
The phone can capture and ask about a photo using its own camera. Browser builds can accept spoken questions using the
browser speech API; native builds have on-device speech output, while native speech input remains disabled pending
local-recognition verification on real phones. The app does not yet receive media from glasses, return answers to a
glasses speaker, or persist glasses captures. There is no wake-word listener, conversation-assistance mode,
consent-based person recognition, or Spotify integration.

Treat these as gaps, not as supported hardware behavior. Select and validate the camera, compute platform, radio, battery,
and frame before committing to hardware-specific resolution, video mode, wireless transport, or runtime claims.

## Current engineering objective: spoken question through glasses

Choose a prototype architecture that can support the required high-quality still-photo and video capture as well as a
microphone, speaker, explicit controls, distinct privacy indicators, a physical mute control, and a secure paired-phone
link. The first end-to-end software slice is one complete voice interaction, establishing build order without reducing
the overall product goal:

1. The wearer deliberately starts a question by a physical control or a locally detected wake word that the wearer has
   explicitly enabled.
2. The hardware visibly indicates active microphone use; a physical mute immediately stops capture.
3. The glasses capture only the audio needed for that request and securely send it to the paired phone when local speech
   recognition or reasoning is not supported by the prototype.
4. The phone sends only the minimum necessary request through the authenticated broker, if cloud AI is enabled.
5. The answer returns securely and plays through the glasses speaker. The wearer can stop speech with a physical control.

Measure wake-word false activations, question-to-first-audio latency, recognition accuracy, privacy-indicator behavior,
mute response, radio reliability, and battery use on the selected prototype before making claims. Set and record photo
resolution and image-quality targets, video resolution/frame-rate/recording-duration targets, and successful authenticated
phone-transfer criteria against the selected camera and wireless link before a capture implementation claims to satisfy
"high quality." The simulator cannot establish audio quality, recognition accuracy, image quality, latency, radio
reliability, battery life, or wearer comfort.

## Link and protocol requirements

- A paired device must authenticate each connection and reject replayed or unauthenticated commands.
- Control messages and media transport must be designed for the selected hardware and phone platforms; do not assume
  Bluetooth Low Energy is suitable for high-resolution media payloads.
- Media transfers need explicit metadata, bounded chunks, integrity verification, acknowledgements, retry/resume behavior,
  cancellation, and resource limits.
- Protocol fields are never reused. Any incompatible change receives a new protocol version.
- A failed or interrupted transfer must leave no partial media presented as a successful capture.
- Voice requests and answers need bounded, authenticated transport and cancellation; a cancelled or disconnected
  request must not keep recording or start delayed speech.
- Local wake-word and conversation-assistance processing must be separable from cloud requests, with an explicit
  distinct wearer-visible state, a bounded volatile wake-detection window, and a physical mute path that clears it.
- Person-memory matches require informed subject enrollment, revocation and deletion, and on-device confidence-gated
  matching that is private to the wearer.

## Validation evidence

Use the shared `GlassesLink` contract and virtual glasses for deterministic software checks. Hardware claims require a real
glasses prototype and paired target phone. Record the device model, camera settings, lighting, file dimensions and size,
transfer duration, integrity result, storage result, and any failure. Report direct device evidence separately from
software checks.
