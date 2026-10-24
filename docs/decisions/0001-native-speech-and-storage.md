# 0001 — Native speech, speech output and encrypted storage

Status: PROPOSED. Needs owner approval of each new dependency before it is added (Goal section 3 and the approval
rule used for expo-secure-store). Nothing here is installed or built. No native build has been run.

## Context

The web preview uses browser speech recognition and speech synthesis, and browser IndexedDB with AES-GCM. Native
phone builds keep notes and memories in process memory only (`apps/mobile/src/memory/vault.ts`), so they are lost on
restart. v9 section 10 requires speech on the phone or an approved provider, and local storage encryption on both
platforms (Goal section 12).

## Candidate packages (checked on the npm registry, 2026-10-24)

| Need            | Package                   | Version | Licence | Route                                            | Notes                                                                                                                                                                                        |
| --------------- | ------------------------- | ------- | ------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Speech output   | `expo-speech`             | 58.0.3  | MIT     | Platform text-to-speech (on device)              | Fits the on-device rule. Voice quality depends on the device. Telugu and Hindi voices depend on the device.                                                                                  |
| Speech input    | `expo-speech-recognition` | 58.0.0  | MIT     | Platform recogniser (on-device option available) | Community package, not Expo's own. Its on-device mode must be confirmed on device before use. The recogniser setting must not send audio to a cloud service by default.                      |
| Encrypted notes | `expo-sqlite`             | 58.0.14 | MIT     | SQLite on device                                 | Expo-maintained. Encryption needs confirming for SDK 58 (SQLCipher option). If unavailable, store encrypted rows as the browser vault does, using AES-GCM with a key in `expo-secure-store`. |
| Key storage     | `expo-secure-store`       | 58.0.2  | MIT     | Keychain or Keystore                             | Already approved and in use for the device credential.                                                                                                                                       |

## Recommendation

1. Speech output: `expo-speech`. It is an Expo module, runs on the device, and adds no cloud route.
2. Speech input: `expo-speech-recognition` only after the on-device-only setting is verified on an Android device and an
   iPhone. Until then, native input stays disabled and the app says so. Do not fall back to cloud recognition silently.
3. Storage: `expo-sqlite` with an encryption key held in `expo-secure-store`, after confirming SDK 58 support. The rows
   stay as ciphertext on disk, and the existing export and delete semantics stay the same (export writes plaintext
   only on the user's request; delete-all removes rows and the key).

## Owner approvals needed

- Approve `expo-speech` (output).
- Approve `expo-speech-recognition` (input), conditional on the verification above.
- Approve `expo-sqlite` (storage).
- Approve one EAS development build to test native speech and storage on a device. This uses the owner's Expo account
  and build minutes. The agent does not run builds or sign anything.

## Verification required before acceptance

- Unit tests with the native modules mocked, covering permission denied, recogniser unavailable, interruption (stop
  within 0.5 s is a measurement, not a unit test), restart recovery, corrupt rows, and key loss.
- Device tests: permission prompts, background and foreground transitions, phone restart, storage after restart.
- Nothing above is claimed as passing until those runs exist.
