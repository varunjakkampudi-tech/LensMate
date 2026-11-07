# 0001 — Native speech, speech output and encrypted storage

Status: Implemented with owner-approved dependencies. Native speech output and encrypted storage are in use. The
`expo-speech-recognition` package and native adapter are present, but native speech input remains disabled until its
on-device-only behavior is verified on a real iPhone and Android phone. No such device verification is recorded here.

## Context

The web preview uses browser speech recognition and speech synthesis, and browser IndexedDB with AES-GCM. Native
builds use on-device speech output and encrypted SQLite storage. Voice input remains available only in browsers with
the Web Speech API; native recognition stays off until local-only behavior is checked on target phones.

## Dependencies (versions checked on the npm registry, 2026-10-24)

| Need            | Package                   | Version | Licence | Route                                            | Notes                                                                                                                                                                         |
| --------------- | ------------------------- | ------- | ------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Speech output   | `expo-speech`             | 58.0.3  | MIT     | Platform text-to-speech (on device)              | Fits the on-device rule. Voice quality depends on the device. Telugu and Hindi voices depend on the device.                                                                   |
| Speech input    | `expo-speech-recognition` | 58.0.0  | MIT     | Platform recogniser (on-device option available) | Community package, not Expo's own. Its on-device mode must be confirmed on device before use. The recogniser setting must not send audio to a cloud service by default.       |
| Encrypted notes | `expo-sqlite`             | 58.0.14 | MIT     | SQLCipher-encrypted SQLite on device             | `useSQLCipher` is enabled in app config. The native store checks `PRAGMA cipher_version` and refuses to write if SQLCipher is unavailable; its key is held in secure storage. |
| Key storage     | `expo-secure-store`       | 58.0.2  | MIT     | Keychain or Keystore                             | Already approved and in use for the device credential.                                                                                                                        |

## Implemented behavior

1. Speech output: `expo-speech`. It is an Expo module, runs on the device, and adds no cloud route.
2. Speech input: `expo-speech-recognition` only after the on-device-only setting is verified on an Android device and an
   iPhone. Until then, native input stays disabled and the app says so. Do not fall back to cloud recognition silently.
3. Storage: `expo-sqlite` with SQLCipher enabled and an encryption key held in `expo-secure-store`. The store fails
   closed if SQLCipher is unavailable; export writes plaintext only on the user's request, and delete-all removes the
   database and key together.

## Verification still required

- Unit tests with the native modules mocked, covering permission denied, recogniser unavailable, interruption (stop
  within 0.5 s is a measurement, not a unit test), restart recovery, corrupt rows, and key loss.
- Device tests: permission prompts, background and foreground transitions, phone restart, storage after restart.
- Native speech input must remain disabled until on-device-only recognition is verified on an iPhone and an Android
  phone. If either device cannot provide local recognition, LensMate must refuse voice input rather than silently send
  audio to a cloud transcription service.
