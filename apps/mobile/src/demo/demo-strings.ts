import { SPEECH_STOP_TARGET_MS } from "@lensmate/core";
import type { PhraseId, QuestionId, SceneId } from "./demo-catalogue";

/**
 * Every user-facing string of the SEE-HEAR-TALK demo. Components read from here only (Standards section 3).
 * The demo is synthetic: scenes, transcripts and answers are made up, and answers are canned mock output.
 */
export const DEMO_MOCK_LABEL = "MOCK RESPONSE — canned demo answer, not AI output";

export const DEMO = {
  openButton: "Try the demo",
  openHint:
    "Synthetic scenes, a synthetic transcript and a mock answer. No camera, microphone or AI is used.",
  title: "Virtual glasses demo",
  intro:
    "Shows the see, hear and talk flow of the glasses with synthetic samples only. Nothing is recorded, nothing is sent, and no real service answers.",
  banner: "DEMO ONLY. Every scene, transcript and answer here is synthetic or a mock.",
  back: "Back to home",
  simulatedNote:
    "Times in this demo are SIMULATED on a fixed timeline. They are not measured. The glasses stop speech on a press; the stop time is never a measured value.",

  indicatorTitle: "Privacy indicator",
  indicatorOff: "Indicator: camera off, microphone off.",
  indicatorPhoto: "Indicator: camera on for a photo. Microphone off.",
  indicatorHold: "Indicator: microphone on while you hold the button. Camera off.",
  indicatorTranslation:
    "Indicator: translation on. The microphone is listening for this session. Camera off.",

  scenarioGroup: "Demo scenario",
  scenarioHint: "The scenario applies to the next answer. Changing it clears the current answer.",
  scenarios: {
    NORMAL: "Normal answer",
    PROVIDER_TIMEOUT: "Provider timeout",
    PROVIDER_UNAVAILABLE: "Provider unavailable",
    SPEND_CAP: "Spend cap reached",
    OFFLINE: "Offline",
  },

  seeTitle: "1. See: choose a synthetic scene",
  sceneLabel: "SYNTHETIC SCENE",
  scenes: {
    STREET_SIGN: {
      title: "Street sign",
      description:
        "A blue road sign with white letters that read ONE WAY, on a grey pole above a bench.",
    },
    MEDICINE_LABEL: {
      title: "Medicine label",
      description:
        "A white label with three printed lines of dosage text. It is not a real medicine.",
    },
    MENU: {
      title: "Menu",
      description: "A paper menu with three priced lines. The prices are made up.",
    },
    PLAIN_WALL: {
      title: "Plain wall",
      description: "A plain grey wall with no printed text. It is a synthetic picture.",
    },
  } satisfies Record<SceneId, { readonly title: string; readonly description: string }>,
  pickScene: "Choose a scene first.",
  photo: "Take photo (single tap)",
  photoNeedsScene: "Choose a scene before taking a photo.",
  photoTaken: (count: number) =>
    `Photos taken in this demo: ${String(count)}. A photo is one synthetic frame and is not saved.`,

  hearTitle: "2. Hear: ask a question",
  holdToAsk: "Hold to ask (push-to-talk)",
  holdHint:
    "Hold while you speak, then let go to send. No audio is recorded: the first sample for this scene is used.",
  askSample: "Ask: ",
  transcriptLabel: "SYNTHETIC TRANSCRIPT",
  transcriptNote: "A fixture for a prerecorded sample. No audio was recorded.",
  questions: {
    SIGN_SAYS: "What does the sign say?",
    SIGN_DIRECTION: "Which way does the traffic go?",
    DOSE_FREQUENCY: "How often should I take it?",
    DOSE_LIMIT: "What is the most I can take in a day?",
    CHEAPEST_ITEM: "What is the cheapest item?",
    SOUP_PRICE: "Is there soup, and what does it cost?",
    WALL_TEXT: "Is there any text on the wall?",
    WALL_DESCRIBE: "What is on the wall?",
  } satisfies Record<QuestionId, string>,

  talkTitle: "3. Talk: the answer",
  mockLabel: DEMO_MOCK_LABEL,
  answers: {
    SIGN_SAYS: "The sign reads ONE WAY.",
    SIGN_DIRECTION: "On this synthetic sign the traffic goes to the right.",
    DOSE_FREQUENCY: "The label says one tablet twice a day, with food.",
    DOSE_LIMIT: "The label says no more than 4 tablets in 24 hours.",
    CHEAPEST_ITEM: "The tea is the cheapest item on this synthetic menu, at 20.",
    SOUP_PRICE: "Yes. The soup of the day is on the menu at 40.",
    WALL_TEXT: "No. The synthetic wall has no printed text.",
    WALL_DESCRIBE: "A plain grey synthetic wall, with no printed text on it.",
  } satisfies Record<QuestionId, string>,
  answerEmpty: "The answer appears here, one word at a time.",
  stop: "Stop",
  stopTiming: (ms: number) =>
    `Stopped at ${String(ms)} ms on the simulated timeline. SIMULATED, not measured. Target: ${String(SPEECH_STOP_TARGET_MS)} ms.`,

  statusIdle: "Choose a scene, then take a photo or ask a question.",
  statusProcessing: "Preparing the answer. This is a mock: nothing is sent.",
  statusStreaming: "Answer appearing at a fixed simulated pace.",
  statusPlaying: "Playing back. SIMULATED: there is no sound.",
  statusStopped: "Stopped. The stop time is SIMULATED, not measured.",
  statusDone: "Playback finished. SIMULATED: there was no sound.",
  busyLocked: "Scene, scenario and question choices pause while an answer runs.",

  errorTitle: "Something went wrong",
  errors: {
    TIMEOUT: "The answer service did not reply in time. This is the demo timeout scenario.",
    UNAVAILABLE:
      "The answer service is unavailable. This is the demo outage scenario. Try again later.",
    CAP_REACHED:
      "The monthly spend cap is reached, so answers are paused until next month. The budget below is MOCK.",
    OFFLINE: "No connection. The question was not sent. Retry once you are back online.",
  },
  retry: "Retry",
  backToQuestions: "Back to the questions",

  budgetTitle: "MOCK budget",
  budgetLine: (spent: number, cap: number) =>
    `MOCK budget: ${String(spent)} of ${String(cap)} minor units used. Mock figures, not billing.`,

  ocr: {
    button: "Read the text",
    label: "MOCK OCR",
    sourceNote: "SYNTHETIC TEXT — fixture, not read from a camera",
    scopeNote: "Reads the scene already chosen. No photo is taken and no camera is used.",
    noText: "I could not read it clearly. This synthetic scene has no legible text.",
    fixtureLines: {
      STREET_SIGN: ["ONE WAY"],
      MEDICINE_LABEL: [
        "Take 1 tablet twice a day with food.",
        "Maximum 4 tablets in 24 hours.",
        "Synthetic label for a demo.",
      ],
      MENU: ["Soup of the day   40", "Veg roll   60", "Tea   20"],
      PLAIN_WALL: [],
    } satisfies Record<SceneId, readonly string[]>,
  },

  translation: {
    stepTitle: "4. Translate: two-way, mock",
    stepNote:
      "Translation uses a fixed table, not a translation service. It makes no network call and ignores the scenario choice.",
    start: "Start translation",
    announcementLabel: "Announcement to the other person (SIMULATED: no sound is played)",
    phraseHint: "Choose a synthetic phrase. It is a fixture: no audio is recorded.",
    phraseButton: (text: string) => `Synthetic phrase: ${text}`,
    transcriptLabel: "SYNTHETIC TRANSCRIPT",
    transcriptNote: "A fixture phrase. No audio was recorded.",
    resultLabel: "MOCK TRANSLATION — fixed phrase table, not a translation service",
    resultNote: "A word that is not in the table is marked unsure.",
    languages: { TELUGU: "Telugu", HINDI: "Hindi" },
    languageLine: (language: string, text: string) => `${language}: ${text}`,
    unsure: "unsure",
    countdown: (time: string) =>
      `Silence limit: ${time} left before this session stops. SIMULATED countdown, not measured.`,
    stop: "Stop translation",
    stopped: "Translation stopped. Nothing is kept: the phrase and its translation are cleared.",
    silenceStopped: (minutes: number) =>
      `Translation stopped after ${String(minutes)} minutes of silence. SIMULATED countdown, not measured.`,
    phrases: {
      GREETING: "Good morning, thank you",
      STATION: "Where is the station",
      NOT_IN_TABLE: "Please help, quantum orchard",
    } satisfies Record<PhraseId, string>,
    // Keys are the normalised English phrase (lower case, no punctuation).
    phraseTable: {
      "good morning thank you": { telugu: "శుభోదయం, ధన్యవాదాలు", hindi: "सुप्रभात, धन्यवाद" },
      "where is the station": { telugu: "స్టేషన్ ఎక్కడ ఉంది", hindi: "स्टेशन कहाँ है" },
    } satisfies Readonly<Record<string, { readonly telugu: string; readonly hindi: string }>>,
    // Keys are single lower-case English words, used only when the whole phrase is not in the table.
    wordTable: {
      please: { telugu: "దయచేసి", hindi: "कृपया" },
      help: { telugu: "సహాయం", hindi: "मदद" },
      station: { telugu: "స్టేషన్", hindi: "स्टेशन" },
      where: { telugu: "ఎక్కడ", hindi: "कहाँ" },
    } satisfies Readonly<Record<string, { readonly telugu: string; readonly hindi: string }>>,
  },

  logTitle: "Event log summary",
  logLine: (counts: {
    readonly photos: number;
    readonly questions: number;
    readonly answers: number;
    readonly stops: number;
    readonly errors: number;
    readonly ocr: number;
    readonly translationStarts: number;
    readonly translationStops: number;
  }) =>
    `${String(counts.photos)} photo, ${String(counts.questions)} question, ${String(counts.answers)} answer, ${String(counts.stops)} stop, ${String(counts.errors)} error, ${String(counts.ocr)} text read, ${String(counts.translationStarts)} translation start, ${String(counts.translationStops)} translation stop. Recorded as kinds only.`,
} as const;
