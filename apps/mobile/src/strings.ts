// User-facing text. Translations (English, Telugu, Hindi) are added with the localization stage.
export const STRINGS = {
  title: "LensMate",
  statusLabel: "Glasses link",
  statusConnected: "Connected to virtual glasses",
  statusDisconnected: "Not connected",
  connect: "Connect virtual glasses",
  disconnect: "Disconnect",
  connectFailed: "Could not connect. Try again.",
  openEnrolment: "Enrol this phone",
  // Owner-approved cloud notice, version 2026-10-26.1 (APPROVED_CLOUD_DISCLOSURE_VERSION). A text change needs a new version.
  cloudDisclosure: [
    "LensMate sends only what you choose to the cloud, and only when you ask:",
    "• Photos you capture and your questions go to LensMate's broker, which forwards them through OpenRouter to a model provider (currently OpenAI, served from Azure) with zero data retention and no training on your data.",
    "• Speech recognition uses your browser's or phone's own speech service (Chrome sends audio to Google to transcribe it). Spoken replies are made on this device.",
    "• Nothing is recorded in the background. The camera and microphone run only while you hold a session, and the red indicator shows it.",
    "• Notes and saved captures stay on this device, encrypted. You can export or delete them at any time.",
    "• Optional backup: if you choose it, your memory is encrypted on this device with your own passphrase and kept on LensMate's server only for the period you pick (7 days to 1 year). The server cannot read it.",
    "• Spending is capped at ₹500 a month on the server. When the cap is reached, AI answers stop until next month.",
  ],
  enrolment: {
    title: "Enrol this phone",
    intro:
      "Enter the single-use code the owner gave you and a name for this phone. The code works once and expires after 10 minutes. This phone’s credential is kept only on this phone.",
    codeLabel: "Enrolment code",
    codeHint: "Sixteen letters and digits, for example ABCD-EFGH-JKMN-PQRS",
    labelLabel: "Phone name",
    labelHint: "Letters, numbers, spaces, dots, dashes and underscores, up to 64 characters",
    submit: "Enrol this phone",
    submitting: "Enrolling",
    enrolled: "This phone is enrolled as device {id}.",
    alreadyEnrolled:
      "This phone already has a credential (device {id}). If the owner has revoked it, remove it below, then enrol again.",
    invalidCredential:
      "The stored credential on this phone is damaged. The app will not delete it on its own. Ask the owner to revoke this phone’s old device, then enrol again.",
    rejected:
      "The broker no longer accepts this phone’s credential. Ask the owner to enrol the phone again.",
    notConfigured: "The broker address is not set in this build, so enrolment is unavailable.",
    configInvalid:
      "The broker address in this build is invalid or insecure, so enrolment is unavailable.",
    codeFormat: "The code has 16 letters and digits, usually shown in groups of four.",
    labelFormat: "Use 1 to 64 letters, numbers, spaces, dots, dashes or underscores.",
    errors: {
      BUSY: "An enrolment is already running. Wait for it to finish.",
      STORED_CREDENTIAL_INVALID:
        "A damaged credential is stored on this phone. Remove it first, then enrol again.",
      REFUSED:
        "The code was not accepted. It may be wrong, already used, or expired. Ask the owner for a new code.",
      RATE_LIMITED: "Too many attempts. Wait a few minutes and try again.",
      NETWORK: "Could not reach the broker. Check the connection and try again.",
      MALFORMED: "The broker sent an unexpected reply. Try again later.",
      FAILED: "Enrolment failed. Try again later.",
      REGISTERED_BUT_NOT_STORED:
        "The broker registered this phone as device {id}, but the credential could not be stored here. Ask the owner to revoke device {id}, then enrol again.",
      READ_FAILED:
        "This phone could not read its stored credential. Restart the app and try again.",
      WRITE_FAILED:
        "This phone could not store its credential. Free up storage or unlock the phone, then try again.",
      DELETE_FAILED: "This phone could not remove the stored credential. Try again.",
    },
    removeInvalid: "Remove the damaged credential from this phone",
    removeEnrolled: "Remove this phone’s credential",
    removeConfirm: "Tap again to remove the credential from this phone. This cannot be undone.",
    removed: "The stored credential was removed. You can enrol this phone again.",
    reinstallNote:
      "If this phone was enrolled before it was reinstalled or its data was cleared, that old device may still be active. Ask the owner to revoke it before enrolling this phone again.",
    back: "Back to home",
  },
} as const;
