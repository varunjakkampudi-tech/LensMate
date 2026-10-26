# LensMate On-Device Test Run Sheet

A quick, one-page evaluation sheet for testing the LensMate mobile application on a real phone.

**Tester Name:** ____________________ &nbsp;&nbsp;&nbsp;&nbsp; **Device Model / OS:** ____________________  
**Date:** ____________________ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; **Overall Status:** `[ ] PASS   [ ] FAIL`

---

### Step 1: Install the App

- **Action:** Open your phone browser (Safari on iPhone, Chrome on Android) and navigate to `https://lensmate.tech/app`. Open the browser menu and select **Add to Home Screen** (or **Install**). Tap the new **LensMate** icon on your home screen to launch the app.
- **Expected Result:** LensMate opens smoothly in full screen without browser toolbars, showing the home screen with "See", "Hear & Talk", "Translate", and "Notes".
- **Result:** `[ ] Pass &nbsp;&nbsp; [ ] Fail`

---

### Step 2: Allow Camera and Microphone

- **Action:** Tap **See**, then tap **Camera**. When your phone prompts you to allow camera access, tap **Allow**. Return to Home, tap **Hear & Talk**, and tap the **Microphone** button. When prompted for microphone access, tap **Allow**.
- **Expected Result:** The camera preview opens and the microphone activates without error warnings or permission blocks.
- **Result:** `[ ] Pass &nbsp;&nbsp; [ ] Fail`

---

### Step 3: Ask a Question About a Saved Note

- **Action:** Tap **Notes** in the bottom navigation. In the **New note** box, type: `I parked on Level 3, Bay 42` and tap **Save note**. Scroll down to **Ask my notes**, type `Where did I park?`, and tap **Ask**.
- **Expected Result:** The assistant answers accurately using your saved note (for example: "You parked on Level 3, Bay 42").
- **Result:** `[ ] Pass &nbsp;&nbsp; [ ] Fail`

---

### Step 4: Ask a Question With No Saved Note

- **Action:** In the same **Ask my notes** box, clear the question and type: `What is my hotel room number?` (a topic with no saved note). Tap **Ask**.
- **Expected Result:** The response clearly indicates that no matching note was found, and does not display unrelated notes or parking information.
- **Result:** `[ ] Pass &nbsp;&nbsp; [ ] Fail`

---

### Step 5: Stop the Assistant Mid-Sentence

- **Action:** Tap **Hear & Talk** in the bottom navigation. Tap the suggested prompt **What can you do?** to make the assistant speak aloud. While the assistant is actively speaking, immediately tap the red **Stop** button.
- **Expected Result:** The assistant cuts off instantly mid-sentence, spoken audio ceases immediately, and a note appears confirming it was stopped.
- **Result:** `[ ] Pass &nbsp;&nbsp; [ ] Fail`

---

### Step 6: Read the Diagnostics Stop Time

- **Action:** Tap **Profile** in the bottom navigation. Tap on the **Diagnostics** section to expand it, then tap **Open diagnostics**. Look at the **Checks** section near the top for the **Last stop** line.
- **Expected Result:** The line displays the measured stop response time in milliseconds (for example: `Last stop: 142 ms`).
- **Result:** `[ ] Pass &nbsp;&nbsp; [ ] Fail`

---

### Step 7: Export Memory and Check the Share Sheet

- **Action:** Tap **Notes** in the bottom navigation. Scroll down to the **Your data** card and tap **Export all**.
- **Expected Result:** Your phone's system share menu opens, showing an exported backup file ready to save, copy, or send.
- **Result:** `[ ] Pass &nbsp;&nbsp; [ ] Fail`

---

### Step 8: Delete All Memory and Check It Is Empty

- **Action:** Dismiss the share menu. On the **Your data** card in Notes, tap the red **Delete everything** button.
- **Expected Result:** All saved notes and reminders disappear immediately. The notes list displays `Nothing saved yet.` and remains empty.
- **Result:** `[ ] Pass &nbsp;&nbsp; [ ] Fail`

---

### Tester Notes & Sign-off

**Observations / Comments:**

---

---

**Tester Signature:** ________________________________________ &nbsp;&nbsp;&nbsp;&nbsp; **Date:** ____________________
