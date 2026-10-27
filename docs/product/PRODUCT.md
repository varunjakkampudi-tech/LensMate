# LensMate product contract

## Product vision

LensMate is a personal AI companion worn as glasses and paired with a phone. It should feel ready throughout the day:
the wearer can ask a question naturally, get a direct spoken answer through the glasses, capture high-quality photos and
video on command, and rely on a private memory that can recall useful context at the right time.

LensMate should be warm and helpful like a trusted mate, while being clear when it is uncertain and leaving decisions
with the wearer. The glasses are the primary voice and camera interface. The phone provides setup, connectivity,
encrypted storage, controls, and future connections to services such as Spotify.

## Core experiences

- **Ask and act:** The wearer asks a question or gives a supported task by voice and receives a concise spoken
  response through the glasses. Task execution is limited to capabilities and phone integrations the wearer has enabled.
  Actions with consequences, such as sending a message, placing a call, or making a purchase, require confirmation.
- **Capture:** A deliberate command or control captures a high-resolution photo or video. The physical recording light
  is on whenever the camera or active microphone is recording. Media transfers securely to the paired phone and is
  saved in owner-controlled encrypted storage.
- **Personal memory:** The wearer can ask LensMate to remember facts, preferences, commitments, and notes, then recall
  them conversationally. Memories are editable, searchable, exportable, and deletable by the owner.
- **People the wearer asks LensMate to remember:** The wearer can create a private note about someone. In a future
  implementation, matching is allowed only after that person knowingly enrolls and agrees to it. Enrollment can be
  revoked, which deletes their face template and linked notes. Matching runs on-device, uses confidence thresholds, and
  never searches for or identifies unenrolled people. A match privately reminds the wearer; LensMate must not speak
  private notes to the other person.
- **Conversation assistance:** The wearer can explicitly start a listening session and ask LensMate to point out a
  likely correction or useful detail. It processes audio locally by default, alerts only the wearer through a private
  audio route or haptic, explains uncertainty, and avoids speaking over the conversation. Any cloud processing requires
  a separate opt-in for that session. The wearer can end the session or mute the microphone at any time; audio and
  transcripts are not retained by default.
- **Phone services:** Mobile integrations, including Spotify controls, are future extensions. Each integration requests
  only the permissions it needs and is controlled from the phone.

## Trust and privacy rules

- “Available all day” does not mean silently recording or uploading all day. Any always-ready wake-word detection must
  be explicitly enabled, show a distinct hardware state that means the microphone is on for local wake detection, and
  have a physical mute control. It may use only a short, bounded volatile audio window for local detection; the window
  is immediately discarded when no wake word is detected. A separate, unmistakable state marks request audio capture
  and any transmission. Mute stops microphone input and clears the volatile window. No full conversation is saved or
  sent before the wearer starts an interaction. If hardware cannot make these states obvious, do not ship always-ready
  listening.
- Conversation assistance is a user-started mode with an unmistakable indicator. Process audio locally where feasible;
  do not retain raw audio or transcripts by default. Send only the minimum required excerpt to a cloud service, and only
  under a separate, clear opt-in.
- Camera capture and video recording always require a deliberate wearer action and a visible recording light. No
  background camera use.
- Saved media and personal memories are encrypted on the paired phone by default. The wearer can inspect, export, edit,
  and delete saved information.
- Person memory requires that person's informed enrollment and must provide revocation and deletion. Do not build general
  face search, identify unenrolled bystanders, or disclose a person's saved details to them or to anyone else. False
  matches must not trigger a confident identification.
- Network AI requests pass through the broker and its authentication, privacy, and spend controls. Provider credentials
  never go in the mobile app.
- Quality, latency, reliability, recognition accuracy, and battery claims require measurements on target hardware.
  Simulator output and code targets are not real-device evidence.
- Keep LensMate for personal use until the owner explicitly changes that decision.

## Current implementation

- The mobile app supports phone-camera photo questions, voice questions through the phone, basic encrypted personal
  notes, device status, and diagnostics.
- Glasses currently exist only as a virtual development device. There is no real glasses firmware or wireless link.
- The current protocol does not transfer photo, video, or audio payloads from glasses.
- The broker provides authenticated AI requests and privacy and spend safeguards. It does not implement continuous
  listening, person recognition, or phone-service integrations.
- Direct glasses answers, high-quality glasses photo/video capture, ambient conversation assistance, and advanced memory
  are product goals, not working capabilities today.

## Current engineering objective

Choose and prototype a glasses-to-phone architecture that can meet the voice, high-quality still-photo and video,
privacy-indicator, battery, and connection requirements. The first end-to-end software slice is one real voice question
answered aloud through the glasses with an authenticated phone/AI path and clear microphone-state indication; this
establishes build order without narrowing the overall product goal. Set measurable photo and video acceptance targets
against selected hardware before making quality claims.

## Repository scope

Keep code, documentation, and tools only when they implement, secure, operate, or validate this contract. Keep this
document as the product direction and current objective; do not reintroduce feature catalogs, blocker logs, or phase
scorecards.
