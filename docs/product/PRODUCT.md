# LensMate product contract

## Product

LensMate is personal AI glasses with a phone companion. The glasses capture high-quality photos and video, let the owner
ask spoken questions, and deliver friendly spoken answers. The phone provides the connection, private storage, settings,
and access to the owner's editable personal memory.

The product is built around one complete experience: capture with the glasses, securely deliver media to the paired
phone, ask about what was captured or about the owner's saved notes, and hear the answer. The phone app and glasses
firmware evolve together.

## Product rules

- Capture starts only from an intentional button press or owner action. A visible recording light is required whenever
  the camera or microphone is active.
- Saved photos, video, answers, and memory belong to the owner and stay encrypted on the paired phone by default.
- The owner can create, edit, search, and delete personal notes. LensMate does not identify people or create
  face-recognition profiles.
- Network AI requests use the broker and its privacy, authentication, and spend controls. Never put provider credentials
  in the mobile app.
- Quality, latency, reliability, and battery claims must come from measurements on the target device. Do not present a
  simulator result or code target as a real-device result.
- Keep the product personal-use only until the owner explicitly changes that decision.

## Current implementation

- The mobile app has assistant, photo capture and ask, encrypted notes, device status, and diagnostics.
- The glasses link currently has a virtual implementation for development. No real glasses firmware or wireless link is
  implemented yet.
- The protocol currently covers device identity, button events, capture indicator, sessions, and acknowledgements. It
  does not yet transfer photo, video, or audio payloads.
- The broker provides authenticated AI requests and privacy and spend safeguards. Device enrollment and encrypted backup
  exist as supporting code; they are not the product's core experience.
- Media capture directly from glasses, reliable transfer to the phone, and high-quality video are not implemented.

## Current engineering objective

Build and validate one real glasses-to-phone still-photo flow: intentional capture with the physical recording light on,
reliable authenticated transfer, and encrypted storage on the paired phone. Establish a measurable image-quality target
from the selected camera hardware before claiming a resolution. Keep the protocol, simulator, tests, and diagnostics
focused on the same flow.

After this works on the target devices, continue the same end-to-end product loop with video, spoken questions and
answers, and retrieval from the owner's memory.

## Repository scope

Keep code, documentation, and tooling only when they implement, secure, operate, or validate the product contract above.
Do not add unrelated productivity, translation, interview, social, general automation, or speculative AI features.
