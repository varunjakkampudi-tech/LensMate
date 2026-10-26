# LensMate On-Device Testing Checklist

This checklist is for testing the LensMate web application on a real physical iPhone and a real physical Android phone without developer assistance. It provides plain-language instructions, exact screen names, button labels, and test identifiers (`testID`) from the application code.

---

## 1. Setup Instructions

### Opening the App
- **Target URL:** `https://lensmate.tech/app`
- **iPhone:** Open **Safari**, enter `https://lensmate.tech/app` into the address bar, and press **Go**.
- **Android:** Open **Google Chrome**, enter `https://lensmate.tech/app` into the address bar, and press **Go**.

### Adding to Home Screen (PWA Installation)
- **iPhone (Safari):**
  1. In Safari, tap the **Share** button (the square icon with an upward-pointing arrow) in the bottom toolbar.
  2. Scroll down the share sheet and tap **Add to Home Screen**.
  3. Confirm the name is **LensMate** and tap **Add** in the top-right corner.
  4. Launch the application by tapping the **LensMate** icon on your home screen.
- **Android (Chrome):**
  1. In Chrome, tap the **three dots menu icon (⋮)** in the top-right corner.
  2. Tap **Add to Home screen** or **Install app**.
  3. Tap **Install** or **Add** on the confirmation prompt.
  4. Launch the application by tapping the **LensMate** icon on your home screen or app drawer.

### Browser Permissions: What to Allow and When
LensMate only accesses device hardware during active user sessions. Nothing is recorded or captured in the background.
- **Camera Permission:**
  - **When asked:** The browser prompt will appear the first time you tap the **Camera** button (`start-camera-button`) on the **See** screen (`/capture`) or start the Virtual Glasses Simulator (`/simulator`).
  - **Action:** Tap **Allow** (or "Allow While Using App").
- **Microphone Permission:**
  - **When asked:** The browser prompt will appear the first time you initiate speech:
    - Tapping the microphone button (`talk-mic-button`) on **Assistant** (`/assistant`).
    - Tapping **Hold to speak** (`translate-speak`) on **Translate** (`/translate`).
    - Tapping **Dictate note** (`memory-dictate-button`) on **Memory** (`/memory`).
  - **Action:** Tap **Allow**.
- **Notifications Permission (Optional):**
  - **When asked:** When creating a reminder or testing notifications on **Diagnostics** / **Profile**. Tap **Allow** if prompted.

### Privacy Rule: What the Owner Must NOT Do
> [!CAUTION]
> **No Real Personal Data:** In all test runs, do **NOT** enter real personal credentials, account passwords, government identity numbers (e.g., Aadhaar, SSN), credit card details, or private personal photographs beyond what you explicitly intend to test and keep locally.
> Use sample phrases (e.g., "Where did I park?"), test notes, and neutral objects (e.g., a coffee mug, notebook, book cover, or household appliance) during vision and memory testing.

---

## 2. P-1 Feature Test Cases

Navigation across screens uses the bottom navigation bar (`bottom-nav`):
- **Home:** Tab label `Home` (`nav-home`, `/`)
- **Simulator:** Tab label `Simulator` (`nav-simulator`, `/simulator`)
- **Capture / See:** Tab label `Capture` (`nav-capture`, `/capture`) or Home tile `See` (`tile-see`)
- **Assistant:** Tab label `Assistant` (`nav-assistant`, `/assistant`) or Home tile `Hear & Talk` (`tile-hear-talk`)
- **Profile:** Tab label `Profile` (`nav-profile`, `/profile`) or top header gear button (`header-settings`)
- **Translate:** Reached via Home tile `Translate` (`tile-translate`, `/translate`)
- **Memory / Notes:** Reached via Home tile `Notes` (`tile-notes`, `/memory`) or Profile section `Memory and backup`

---

### F1: Vision Help — Describe What Is in Front of You on Request

- **Screen:** See (`/capture`), accessible via bottom tab **Capture** (`nav-capture`) or Home tile **See** (`tile-see`).
- **Steps to test:**
  1. Navigate to the **See** screen.
  2. Tap the button labelled **Camera** (`start-camera-button`). Confirm the camera preview starts and the top indicator banner displays `Camera on · Photo & Ask` (`capture-indicator`).
  3. Aim your phone at an object in front of you (e.g., a chair, cup, or plant) and tap the button labelled **Take photo** (`take-photo-button`).
  4. Once the photo appears (`captured-photo`), tap the quick chip button labelled **Describe what you see** (`quick-describe`).
  5. Alternatively, tap the input field labelled **Your question** (`vision-question-input`, placeholder: "What is this? Is it good for indoors?"), type "Describe this object", and tap the send button (`vision-ask-button`).
  6. Wait while the screen displays `Looking…`.
- **Expected result:**
  - An answer card (`vision-answer`) appears displaying a descriptive title and plain-language summary describing the scene or object.
  - The card displays latency metadata and provider status (`MOCK RESULT · NO AI CALLED` or `LIVE RESULT`).
  - Below the answer, action pills appear: **Read Aloud** (`read-aloud-button`), **Save** (`save-capture-button`), and **More** (`more-button`).

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F2: Read Visible Text Aloud

- **Screen:** See (`/capture`), accessible via bottom tab **Capture** (`nav-capture`) or Home tile **See** (`tile-see`).
- **Steps to test:**
  1. Navigate to the **See** screen.
  2. Tap **Camera** (`start-camera-button`) or tap **Upload** (`upload-photo-button`) to photograph or upload an image containing clear printed text (e.g., a book page, printed sign, or label).
  3. Tap **Take photo** (`take-photo-button`).
  4. Under the captured image, tap the quick chip labelled **Read all the text** (`quick-read`).
  5. Observe the answer card (`vision-answer`).
  6. Tap the action pill labelled **Read Aloud** (`read-aloud-button`).
  7. While the text is being read aloud, tap the pill again (now labelled **Stop**, `read-aloud-button`).
- **Expected result:**
  - The answer card extracts and displays the visible text verbatim without guessing or extrapolating unclear words.
  - Tapping **Read Aloud** triggers the phone's voice engine to read the text aloud audibly.
  - Tapping **Stop** immediately halts speech synthesis.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F3: Voice Questions and Spoken Answers, Streaming

- **Screen:** Assistant (`/assistant`), accessible via bottom tab **Assistant** (`nav-assistant`) or Home tile **Hear & Talk** (`tile-hear-talk`).
- **Steps to test:**
  1. Navigate to the **Assistant** screen.
  2. Verify the top status line shows `Ready` (`talk-status`) and the provider badge (`provider-badge`) shows `MOCK` or `LIVE`.
  3. Select your language from the horizontal picker (e.g., tap `English`, `talk-lang-en`).
  4. Tap the round microphone button (`talk-mic-button`, accessibility label: "Speak your question").
  5. The button turns red, status changes to `Listening…`, and the top bar shows `Microphone on · Voice question`.
  6. Speak a question clearly: "What are three benefits of drinking water?"
  7. Tap the microphone button again or pause to finish speaking.
  8. Alternatively, type the question in the text input (`talk-typed-input`, placeholder: "Ask a question or give a task") and tap the send button (`talk-send-button`).
- **Expected result:**
  - Status transitions to `Thinking…`.
  - The answer text streams / populates in an assistant chat bubble.
  - The phone speaks the answer aloud through the browser speech engine (status shows `Speaking…` with active wave bars).
  - Once speech concludes, status returns to `Ready`.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F4: Photo Capture on Button Press, Saved to Phone

- **Screen:** See (`/capture`) and Memory (`/memory`).
- **Steps to test:**
  1. On the **See** screen, tap **Camera** (`start-camera-button`) and tap **Take photo** (`take-photo-button`).
  2. Ask any question or tap **Describe what you see** (`quick-describe`) to produce an answer.
  3. Below the answer card, tap the pill button labelled **Save** (`save-capture-button`, bookmark icon).
  4. Verify the pill changes its label from **Save** to **Saved**.
  5. Navigate to the **Home** tab and tap the **Notes** tile (`tile-notes`), or open `/memory`.
  6. In Memory, tap the filter chip labelled **Captures** (`memory-filter-capture`).
- **Expected result:**
  - The saved capture appears in the list (`memory-item`) displaying a thumbnail of the captured photo, title, description, timestamp, and a **Delete** button.
  - The photo data is stored locally in the browser's encrypted vault.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F5: Voice Notes: Dictate, Save, Retrieve

- **Screen:** Memory (`/memory`), accessible via Home tile **Notes** (`tile-notes`) or Profile section **Memory and backup**.
- **Steps to test:**
  1. Navigate to the **Memory** screen.
  2. Under the **New note** card, tap the button labelled **Dictate note** (`memory-dictate-button`, microphone icon).
  3. Allow microphone access if prompted. The button changes label to **Stop dictation**, and the top bar shows `Microphone on · Voice note`.
  4. Speak a note clearly: "Remember to check car tire pressure on Saturday."
  5. Watch the partial text appear below the button. Tap **Stop dictation** (or pause).
  6. Confirm the dictated text populates the **Note** text field (`memory-note-input`).
  7. Tap the button labelled **Save note** (`memory-save-note-button`, check icon).
  8. Scroll down to the saved items list. Ensure the filter chip **Notes** (`memory-filter-note`) or **All** (`memory-filter-all`) is selected.
  9. Type "tire" into the **Search** field (`memory-search-input`).
- **Expected result:**
  - The dictated speech is transcribed accurately into the text field.
  - Tapping **Save note** clears the input and adds the note to the encrypted store.
  - The note appears in the list below with title, text, timestamp, and matches search queries.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F6: Memory: Save Facts You Choose, Recall Them

- **Screen:** Memory (`/memory`).
- **Steps to test:**
  1. Under the **New note** card, in the **Note** input field (`memory-note-input`), type: "WiFi password for the workshop is Apollo2026".
  2. Tap the button labelled **Save note** (`memory-save-note-button`).
  3. Scroll down to the card titled **Ask my notes**.
  4. In the field labelled **Question** (`memory-ask-input`, placeholder: "Where did I park?"), type: "What is the workshop WiFi password?"
  5. Tap the button labelled **Ask** (`memory-ask-button`, spark icon).
  6. Test the negative boundary: In the same **Question** field, type: "What is the security gate combination?", and tap **Ask**.
- **Expected result:**
  - For the first question: An information banner appears (`memory-ask-answer`) correctly answering "Apollo2026" based exclusively on the saved note.
  - For the second question: The answer explicitly states that the saved notes do not contain the answer, without fabricating facts.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F8: Conversation Summaries on Request

- **Screen:** Assistant (`/assistant`).
- **Steps to test:**
  1. Navigate to the **Assistant** screen.
  2. Ask at least two separate questions to build conversation history, for example:
     - Question 1: "What are the primary colors?"
     - Question 2: "Which of those make green when mixed?"
  3. Once both questions and answers are visible in the chat list and status is `Ready`, locate the button labelled **Summarise this conversation** (`talk-summarise-button`) below the chat history.
  4. Tap **Summarise this conversation**.
- **Expected result:**
  - A user message `Summarise this conversation` is posted.
  - The assistant responds with a concise summary synthesizing the user's questions and assistant's answers from the active session.
  - Stop notices or failed requests are excluded from the summary.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F9: Translation of Visible Text into English, Telugu, Hindi

- **Screen:** See (`/capture`) or Translate (`/translate`).
- **Steps to test:**
  - **Method A (on See screen):**
    1. Navigate to **See** (`/capture`).
    2. Tap **Camera** (`start-camera-button`) or **Upload** (`upload-photo-button`) to capture or upload an image containing text in another language (e.g., Telugu, Hindi, or English).
    3. Tap the quick chip labelled **Translate the text** (`quick-translate`).
  - **Method B (on Translate screen):**
    1. Navigate to **Translate** (`/translate`).
    2. Tap the **Camera** button in the bottom row (`translate-camera`).
    3. Select an image with text.
    4. Set target language box (`lang-to`, "(Translate to)") to your chosen language (e.g., Telugu or Hindi).
- **Expected result:**
  - The application reads the text in the photo and outputs the translated text in the chosen target language.
  - On Translate screen, tapping the speaker icon (`speak-translation`) speaks the translated text aloud (if the browser has a voice for that language).

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F11: Quick Actions: Last Photo, Last Answer, Repeat, Stop

- **Screen:** Assistant (`/assistant`) and See (`/capture`).
- **Steps to test:**
  1. **Test "Repeat the last answer" (Assistant):**
     - On **Assistant**, after an answer has finished speaking, locate the speaker button labelled **Repeat the last answer** (`talk-repeat-button`).
     - Tap **Repeat the last answer**.
     - Verify the answer is spoken aloud again from the start.
  2. **Test "Stop" (Assistant):**
     - Ask a question that produces a long answer.
     - While the assistant is speaking or thinking, tap the red button labelled **Stop** (`talk-interrupt-button`), or tap **Stop** in the top indicator banner (`capture-stop-button`).
     - Verify speech halts immediately, the microphone turns off, and `Stopped. No answer was added to this conversation.` appears.
  3. **Test "Last photo" (See):**
     - Ensure you have saved at least one photo capture previously (via F4).
     - On **See** (`/capture`), without opening the camera, tap the button labelled **Last photo** (`last-photo-button`).
     - Verify the most recently saved photo reopens in the preview area ready for questions, without running the camera.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F12: Wear Detection: Sleep When Removed, Wake When Worn

> [!NOTE]
> **Status: Skipped by owner: needs hardware**  
> This feature requires physical smart glasses hardware equipped with proximity / wear detection sensors. It cannot be executed or validated on a mobile phone browser alone.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [x] Not possible on this phone  
**Notes:** Skipped by owner: needs hardware.

---

### F13: Battery and Health Status on the Phone App

- **Screen:** Diagnostics (`/diagnostics`), accessible via Profile section **Diagnostics** -> button **Open diagnostics** (`open-diagnostics-button`), or navigating to `/diagnostics`.
- **Steps to test:**
  1. Open the **Diagnostics** screen.
  2. Locate the check item titled **Battery** (`diag-battery`).
  3. Tap the button labelled **Check again** (`diag-refresh`).
  4. Compare results between Android and iPhone:
     - **Chrome on Android:** Supports the Battery Status API.
     - **Safari on iPhone:** Does **not** support the Battery Status API.
- **Expected result:**
  - **On Android Chrome:** Status displays **Working** (or **Low: charge soon** if below 20%) with details showing percentage and charging status (e.g., `82%, charging.` or `64%.`).
  - **On iPhone Safari:** Status displays **Unavailable** with detail: `This phone or browser does not report the battery level.` (This is expected behavior on iOS Safari due to Apple privacy restrictions).

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F20: Live Two-Way Translation of Conversation

- **Screen:** Translate (`/translate`), accessible via Home tile **Translate** (`tile-translate`).
- **Steps to test:**
  1. Navigate to the **Translate** screen.
  2. Confirm source language box shows **(You speak)** (`lang-from`, e.g., English) and target shows **(Translate to)** (`lang-to`, e.g., Telugu).
  3. Test swapping: tap the **Swap languages** button (`swap-languages`) in between the boxes. Tap again to return.
  4. Tap the round microphone button labelled **Hold to speak** (`translate-speak`).
     - *First-time notice:* LensMate speaks the announcement: "This conversation is being translated by LensMate. Please speak one at a time."
  5. Speak a sentence in the source language (e.g., "Hello, how can I help you today?").
  6. Tap to stop or wait for utterance end.
- **Expected result:**
  - Recognized speech appears in the top card (`translate-partial`).
  - Translated text appears in the bottom translation card (`translate-caption`).
  - The translated sentence is read aloud automatically if the browser has a voice for the target language.
  - The completed turn is added to the conversation transcript (`conversation-transcript`).
  - **Speaker hand-over:** The speaking turn automatically flips (the previous target becomes the new source) so the other person can tap **Hold to speak** and reply in their language.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F21: Live Captions of Conversation on the Phone

- **Screen:** Translate (`/translate`).
- **Steps to test:**
  1. On the **Translate** screen, conduct a translation exchange by speaking or typing (tap **Keyboard**, `translate-keyboard`, enter text in `translate-typed-input`, and tap **Translate**, `translate-typed-button`).
  2. Inspect the translation caption display (`translate-caption`).
  3. If testing with uncertain words, observe if dotted underlines appear on low-confidence words.
  4. Scroll down to the **Conversation** section (`conversation-transcript`).
  5. Test accessibility captions: Go to **Profile** (`/profile`), section **Accessibility**, switch on **Large captions** (`pref-captions`), and return to **Translate**.
- **Expected result:**
  - Captions are prominently displayed with high contrast.
  - When **Large captions** is enabled, caption text size increases significantly (from 20px to 26px font).
  - Every conversation turn is recorded in the transcript showing who spoke (`Language: heard`) and what was translated (`Language: translated`).
  - If the browser lacks speech synthesis for the target language, a plain note displays: `No <language> voice in this browser: the translation is shown as captions.`

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F22: Language Auto-Detect for English, Telugu, Hindi, and Mixed Speech

- **Screen:** Translate (`/translate`).
- **Browser and Phone Compatibility Notice:**
  > [!IMPORTANT]
  > **Where voice test works:**
  > - **Chrome on Android:** Speech recognition works via Google Web Speech service. However, standard browser Web Speech API does **not** perform automatic multi-lingual language detection; it recognizes speech according to the configured language locale pair.
  > - **Safari on iPhone:** Speech recognition runs via iOS Safari speech service. **iPhone Safari does NOT detect language automatically.** It requires selecting the explicit language. Native listening with on-device auto-detection is switched off in this web build (`NATIVE_LISTENING_ENABLED = false`).
- **Steps to test:**
  1. On **Translate**, set `from` to English and `to` to Telugu.
  2. Tap **Hold to speak** (`translate-speak`).
  3. Speak an English phrase: "Good morning". Verify transcription and translation.
  4. Now speak a Telugu phrase while `from` is still English (or switch `from` to Telugu using `lang-from` and tap Telugu chip `pick-from-te`).
  5. Observe whether the browser recognizes the spoken language or requires manual language pair selection.
- **Expected result:**
  - In web browsers, speech recognition is pinned to the configured language pair; manual selection via language chips (`lang-from`, `lang-to`) correctly sets the recognition and translation direction.
  - Automatic language detection without manual pair selection is "Not possible on this phone" in browser mode.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F26: Voice Stop, Cancel and Repeat

- **Screen:** Assistant (`/assistant`).
- **Browser and Phone Compatibility Notice:**
  > [!IMPORTANT]
  > **Where voice stop works:**
  > - **Chrome on Android:** Chrome allows microphone listening (`listenForStop`) while audio / speech synthesis is actively playing. Saying "Stop" during spoken answers can interrupt playback on Android Chrome.
  > - **Safari on iPhone:** In iOS Safari, activating the microphone automatically pauses / mutes browser speech playback (`speechSynthesis`). Therefore, **stopping by voice during a spoken answer is NOT reliable on iPhone Safari.** Use the on-screen red **Stop** button (`talk-interrupt-button`) or top indicator **Stop** button (`capture-stop-button`) on iPhone.
- **Steps to test:**
  1. **Test Button Stop (iPhone & Android):**
     - Ask a question on **Assistant** (e.g., "Tell me a long story about space exploration").
     - As soon as the spoken answer begins, tap the red button labelled **Stop** (`talk-interrupt-button`).
     - Confirm speech immediately cuts off.
  2. **Test Repeat (iPhone & Android):**
     - After stopping or completing an answer, tap the button labelled **Repeat the last answer** (`talk-repeat-button`).
     - Confirm the assistant repeats the spoken answer.
  3. **Test Voice Stop (Android Chrome):**
     - On Android Chrome, ask a question with a lengthy spoken answer.
     - While the voice is reading aloud and the top bar indicates `Microphone on · Stop by voice`, speak clearly: "Stop" or "Please stop".
     - Observe whether speech interrupts.
- **Expected result:**
  - Button stop and repeat work reliably on both iPhone and Android.
  - Voice stop works on Android Chrome; on iPhone Safari, voice stop is "Not possible on this phone" due to iOS audio session restrictions.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F33: Environment Analysis on Request

- **Screen:** See (`/capture`).
- **Steps to test:**
  1. Navigate to **See** (`/capture`).
  2. Tap **Camera** (`start-camera-button`) and take a photograph of your surrounding physical environment (e.g., an office room, kitchen, hallway, or doorway).
  3. In the input field labelled **Your question** (`vision-question-input`), type: "Describe the layout of this room and any obstacles in the path."
  4. Tap the send button (`vision-ask-button`).
  5. Test the **Mistake checks** feature:
     - Scroll to the card labelled **Mistake checks** (or tap **More**, `more-button`).
     - In the field labelled **Your checks, one per line** (`vision-checks-input`, default: "Is the stove switched off?\nIs the door locked?"), enter a check relevant to the photo (e.g., "Is the doorway clear?").
     - Tap the button labelled **Run checks** (`run-checks-button`).
- **Expected result:**
  - The vision answer (`vision-answer`) provides environmental analysis describing physical layout, objects, and spatial context.
  - Mistake checks return lines formatted as `<check> — Looks fine | Possible issue | Can't tell — reason` with a clear confidence rating, without making false safety guarantees.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F35: Friendly Voice Persona with Tone Settings

- **Screen:** Profile (`/profile`) and Assistant (`/assistant`).
- **Steps to test:**
  1. Navigate to **Profile** (`nav-profile`).
  2. Tap the section labelled **Voice and language** (`profile-section-voice`).
  3. Under **Answer style**, observe the tone chips:
     - **Warm** (`tone-warm`)
     - **Brief** (`tone-brief`)
     - **Formal** (`tone-formal`)
  4. Under **Speaking speed**, observe the speed chips: **0.8×** (`voice-rate-0.8`), **1×** (`voice-rate-1`), **1.2×** (`voice-rate-1.2`), **1.5×** (`voice-rate-1.5`).
  5. Tap the chip labelled **Brief** (`tone-brief`).
  6. Return to **Assistant** (`nav-assistant`) and ask: "Explain gravity." Note that the answer is concise (1–2 sentences).
  7. Return to **Profile**, tap **Voice and language**, and tap **Warm** (`tone-warm`).
  8. Return to **Assistant** and ask: "Explain gravity." Note the warm, encouraging phrasing. Note that the assistant never claims to be human.
- **Expected result:**
  - Selecting different tone chips updates the assistant's phrasing style accordingly.
  - Speed adjustments noticeably alter speech synthesis rate.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F37: Conversation Understanding During a Session You Start

- **Screen:** Assistant (`/assistant`) and AppShell Indicator.
- **Steps to test:**
  1. Open **Assistant** (`nav-assistant`). Note that no recording is active.
  2. Tap the microphone button (`talk-mic-button`) to start a voice question.
  3. Observe that only now does the top indicator bar appear (`capture-indicator`), displaying `Microphone on · Voice question` with a visible indicator dot and a **Stop** button (`capture-stop-button`).
  4. Ask: "Who wrote Romeo and Juliet?"
  5. Once answered, ask a contextual follow-up: "When was it written?"
  6. Tap **Stop** (`talk-interrupt-button` or `capture-stop-button`).
- **Expected result:**
  - Recording occurs strictly within the session initiated by the user.
  - The assistant understands the context of the second question referring back to the play from the first question.
  - Tapping **Stop** immediately ends the session, tears down the microphone, and hides the indicator bar. Nothing records in the background.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F40: Status Indicator Visible to Bystanders During Capture and Listening

- **Screen:** AppShell top bar across all screens.
- **Steps to test:**
  1. **Camera Indicator Test:**
     - Navigate to **See** (`/capture`) and tap **Camera** (`start-camera-button`).
     - Look at the top of the phone screen (under the notch/status bar).
     - Verify the banner (`capture-indicator`) appears with a distinctive live color, white indicator dot, text `Camera on · Photo & Ask`, and a prominent button labelled **Stop** (`capture-stop-button`).
     - Tap **Stop** (`capture-stop-button`). Verify the camera stops and the banner disappears.
  2. **Microphone Indicator Test:**
     - Navigate to **Assistant** (`/assistant`) and tap the microphone button (`talk-mic-button`).
     - Verify the top banner displays `Microphone on · Voice question` with the white indicator dot and **Stop** button.
     - Tap **Stop** (`capture-stop-button`). Verify listening ends and the banner disappears.
- **Expected result:**
  - The status indicator is clearly visible at all times during active camera or microphone use, providing visual transparency to the user and bystanders.
  - The one-tap **Stop** button immediately terminates hardware capture from any screen.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F50: Accessibility Assistance

- **Screen:** Profile (`/profile`), section **Accessibility** (`profile-section-accessibility`).
- **Steps to test:**
  1. Navigate to **Profile** (`nav-profile`). Section **Accessibility** is open by default.
  2. Inspect the pre-configured accessibility profile chips:
     - **Personal** (`profile-personal`): "Everything on, answers shown as text."
     - **Blind assist** (`profile-blind`): "Answers spoken automatically, detailed scene descriptions."
     - **Hearing assist** (`profile-hearing`): "Large captions, nothing spoken unless you ask."
     - **Custom** (`profile-custom`): "Your own mix of the switches below."
  3. Tap **Blind assist** (`profile-blind`). Verify **Speak answers automatically** (`pref-autospeak`) and **Detailed scene descriptions** (`pref-detailed`) are enabled.
  4. Tap **Hearing assist** (`profile-hearing`). Verify **Large captions** (`pref-captions`) is enabled and **Speak answers automatically** is turned off.
  5. Test touch targets: Verify all buttons, tabs, and chips have a minimum 48×48 px touch area.
  6. (Optional) Turn on iOS VoiceOver or Android TalkBack: Swipe through buttons to verify meaningful accessibility labels.
- **Expected result:**
  - Tapping profile chips applies accessibility settings instantly.
  - Large captions mode enlarges fonts across Translate and See.
  - Interactive elements have touch targets meeting accessibility standards.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

### F53: Device and AI Health Awareness

- **Screen:** Diagnostics (`/diagnostics`), accessible via Profile section **Diagnostics** -> **Open diagnostics** (`open-diagnostics-button`).
- **Steps to test:**
  1. Open the **Diagnostics** screen.
  2. Review the capability checks under the **Checks** card:
     - **AI broker address** (`diag-broker`): Shows configured URL or mock status.
     - **Battery** (`diag-battery`): Shows battery level and charging status (Android) or unavailable (iPhone).
     - **Camera** (`diag-camera`): Shows camera support and permission status.
     - **Spoken answers** (`diag-speech-output`): Shows whether text-to-speech output is available.
     - **Voice questions** (`diag-speech-input`): Shows voice input capability.
     - **Notifications** (`diag-notifications`): Shows notification permission status.
     - **Encrypted notes** (`diag-memory`): Shows encrypted storage status (`Browser notes use the encrypted browser vault.`).
  3. Under **Tests you can run now**, tap the button labelled **Speak a test sentence** (`diag-speak`).
     - Confirm the phone audibly speaks: "This is a LensMate speech test."
  4. Tap the button labelled **Stop speech** (`diag-stop-speech`).
     - Confirm speech stops.
- **Expected result:**
  - Every subsystem reports its current status and a plain-language explanation without developer intervention.
  - Built-in diagnostic speech test verifies audio hardware directly on the device.

**Result:** [ ] Pass &nbsp;&nbsp; [ ] Fail &nbsp;&nbsp; [ ] Not possible on this phone  
**Notes:** __________________________________________________

---

## 3. Results Summary Table

Record the test results on each physical phone below:

| Feature | Phone (iPhone / Android) | Browser (Safari / Chrome) | Result (Pass / Fail / Not possible) | Date | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **F1** Vision help: describe what is in front of you | | | | | |
| **F2** Read visible text aloud | | | | | |
| **F3** Voice questions and spoken answers, streaming | | | | | |
| **F4** Photo capture on button press, saved to phone | | | | | |
| **F5** Voice notes: dictate, save, retrieve | | | | | |
| **F6** Memory: save facts you choose, recall them | | | | | |
| **F8** Conversation summaries on request | | | | | |
| **F9** Translation of visible text into English, Telugu, Hindi | | | | | |
| **F11** Quick actions: last photo, last answer, repeat, stop | | | | | |
| **F12** Wear detection (Skipped by owner: needs hardware) | Real Phone | Any Browser | **Not possible on this phone** | | Needs glasses hardware |
| **F13** Battery and health status on the phone app | | | | | |
| **F20** Live two-way translation of conversation | | | | | |
| **F21** Live captions of conversation on the phone | | | | | |
| **F22** Language auto-detect for English, Telugu, Hindi | | | | | |
| **F26** Voice stop, cancel and repeat | | | | | |
| **F33** Environment analysis on request | | | | | |
| **F35** Friendly voice persona with tone settings | | | | | |
| **F37** Conversation understanding during started session | | | | | |
| **F40** Status indicator visible to bystanders | | | | | |
| **F50** Accessibility assistance | | | | | |
| **F53** Device and AI health awareness | | | | | |
