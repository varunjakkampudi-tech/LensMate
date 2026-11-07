# LensMate Master Checklist

Source: owner-supplied master checklist (2026-11-06). Each item has a stable ID.

Each row has independent fields (review CR-01 from ChatGPT, commit 7c0c2fd):

- Implementation: NOT_STARTED / IN_PROGRESS (partial code exists) / IMPLEMENTED
- Verification: NOT_TESTED / PASS / FAIL / PARTIAL (automated tests only; what they cover is in VERIFICATION_EVIDENCE.md)
- Review: NOT_REQUESTED / PENDING / APPROVED / CHANGES_REQUESTED (only ChatGPT's actual replies count)
- Blocker: NONE or a BLK-ID from BLOCKERS.md
- Hardware validation: NOT_APPLICABLE / PENDING / PASS / FAIL (simulation never counts as PASS)

An item is complete only when Implementation is IMPLEMENTED, Verification is PASS for all applicable acceptance
criteria, Review is APPROVED, and Hardware validation is PASS or NOT_APPLICABLE.

Existing-code mapping for rows marked IN_PROGRESS or IMPLEMENTED is in CODE_AUDIT.md.
Acceptance criteria are defined per item in ACCEPTANCE.md before implementation starts.

## A. Smart Glasses Hardware

| ID  | Requirement                                                 | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | ----------------------------------------------------------- | -------------- | ------------ | ------------- | ------- | ------------------- |
| A01 | Lightweight, comfortable wearable frame                     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A02 | Built-in first-person camera with appropriate field of view | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A03 | Built-in multi-microphone array                             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A04 | Integrated left and right open-ear speakers                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A05 | On-glasses application processor / SoC                      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A06 | Neural processing capability for local AI                   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A07 | RAM capacity sized for firmware, audio and model workloads  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A08 | Internal flash for OS, models and temporary media           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A09 | Rechargeable battery and protected charging circuitry       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A10 | Wi-Fi connectivity for direct internet access               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A11 | Bluetooth for optional accessories and pairing              | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A12 | Physical camera capture control                             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A13 | Physical microphone mute / privacy control                  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A14 | Touch, gesture or physical-button interface                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A15 | Camera-active recording indicator                           | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | PENDING             |
| A16 | Microphone / listening state indication                     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A17 | IMU / accelerometer / gyroscope sensors                     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A18 | Ambient light and proximity sensing where justified         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A19 | Thermal sensors and overheating protection                  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A20 | USB-C or appropriate charging connector                     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A21 | Charging case and battery-management strategy               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A22 | Prescription-lens compatibility                             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A23 | Weather, sweat and dust protection validation               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A24 | Optional single-eye or binocular HUD display                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A25 | Optional GNSS / location architecture                       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A26 | Optional embedded cellular radio and eSIM                   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A27 | Repairability and replaceable wear components               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| A28 | Secure boot and hardware root of trust                      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## B. Standalone OS, Firmware and Connectivity

| ID  | Requirement                                                    | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | -------------------------------------------------------------- | -------------- | ------------ | ------------- | ------- | ------------------- |
| B01 | Boot, configure and operate glasses without a smartphone       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B02 | Direct Wi-Fi connection and reconnect management               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B03 | First-time setup without a mandatory phone app                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B04 | Wi-Fi credential onboarding without insecure provisioning      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B05 | Device-to-cloud encrypted authentication                       | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | PENDING             |
| B06 | Device enrollment and owner binding                            | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | PENDING             |
| B07 | Secure firmware and OS updates                                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B08 | Signed over-the-air update packages                            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B09 | Rollback after failed firmware updates                         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B10 | Camera, microphone and speaker hardware drivers                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B11 | Audio routing and echo cancellation                            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B12 | Camera capture and sensor pipelines                            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B13 | Wake-word and low-power listening service                      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B14 | Background task and lifecycle manager                          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B15 | On-device AI runtime                                           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B16 | Offline command router                                         | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| B17 | Local queue and deferred synchronization                       | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| B18 | Power-saving sleep and wake states                             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B19 | Network loss recovery and automatic reconnection               | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| B20 | Local clock and timestamp continuity                           | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| B21 | Remote device lock and credential revocation                   | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| B22 | Factory reset and secure data erasure                          | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| B23 | Diagnostics and crash recovery                                 | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| B24 | Optional eSIM provisioning and cellular data service           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| B25 | Optional phone, PC and accessory pairing                       | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| B26 | Direct pairing with the cloud account independently of a phone | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |

## C. Vision and Real-World Perception

| ID  | Requirement                                                       | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | ----------------------------------------------------------------- | -------------- | ------------ | ------------- | ------- | ------------------- |
| C01 | Take images directly with glasses camera                          | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| C02 | Analyze live camera frames                                        | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| C03 | Voice-triggered visual question answering                         | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| C04 | Recognize everyday objects and environmental features             | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| C05 | Understand scene layout and visual relationships                  | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| C06 | Read signs, books, receipts and labels                            | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| C07 | Read and explain documents, graphs and diagrams                   | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| C08 | Understand product packaging and ingredients                      | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| C09 | Visual product search and comparison                              | IMPLEMENTED    | PASS         | APPROVED      | NONE    | PENDING             |
| C10 | Detect visual scene changes                                       | IMPLEMENTED    | PASS         | NOT_REQUESTED | NONE    | PENDING             |
| C11 | Track selected objects across frames                              | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| C12 | Identify apparent obstacles and hazards without safety guarantees | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| C13 | Describe surrounding environment in natural language              | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| C14 | Support 'What is this?' and 'Look at that' commands               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| C15 | Follow user-directed visual attention                             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| C16 | Combine speech and camera context in one query                    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| C17 | Use frame sampling to control cost and bandwidth                  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| C18 | Apply uncertainty and confidence safeguards                       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| C19 | Optional spatial mapping / object localization                    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| C20 | Optional display-based visual overlays                            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| C21 | Respect restricted environments and camera privacy                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## D. Continuous Video Understanding

| ID  | Requirement                                                     | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | --------------------------------------------------------------- | -------------- | ------------ | ------------- | ------- | ------------------- |
| D01 | First-person video capture                                      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D02 | Synchronize video and microphone audio                          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D03 | Support configurable capture duration and resolution            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D04 | Support short rolling video buffer with explicit activation     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D05 | Understand temporal events rather than independent frames alone | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D06 | Summarize recorded activity                                     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D07 | Search by timestamp and natural-language descriptions           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D08 | Find important moments in previously saved videos               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D09 | Answer 'What happened just now?' using permitted buffer         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D10 | Identify action sequences and changing scenes                   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D11 | Extract transcripts and scene summaries                         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D12 | Combine speech, sound and visual event data                     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D13 | Maintain bounded live observation sessions                      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D14 | Provide optional event-triggered clip saving                    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D15 | Pause or stop recording instantly                               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D16 | Implement visible capture indicator and consent policies        | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | PENDING             |
| D17 | Compress, encrypt and sync clips efficiently                    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D18 | Automatically manage retention and storage pressure             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D19 | Handle interrupted recordings safely                            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| D20 | Test video accuracy against real recordings                     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## E. Hear — Audio Intelligence

| ID  | Requirement                                             | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | ------------------------------------------------------- | -------------- | ------------ | ------------- | ------- | ------------------- |
| E01 | Wake-word or explicit activation                        | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E02 | Voice activity detection                                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E03 | Automatic speech recognition                            | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | PENDING             |
| E04 | Natural conversational listening                        | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E05 | Telugu speech recognition                               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E06 | English speech recognition                              | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E07 | Mixed Telugu-English conversations                      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E08 | Background noise reduction                              | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E09 | Acoustic echo cancellation                              | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E10 | Speaker diarization for authorized recordings           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E11 | Environmental sound recognition                         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E12 | Alarms, horns and important acoustic cue identification | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E13 | Question understanding while viewing surroundings       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E14 | Audio recording with clear user control                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E15 | Authorized meeting and lecture transcription            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E16 | Conversation summaries                                  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E17 | Extract tasks and spoken commitments                    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E18 | Handle interruptions and overlapping speakers           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E19 | Adaptive microphone sensitivity                         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E20 | Offline recognition of selected commands                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| E21 | Emergency-stop / mute voice command                     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## F. Talk — Jarvis-Like Voice

| ID  | Requirement                                      | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | ------------------------------------------------ | -------------- | ------------ | ------------- | ------- | ------------------- |
| F01 | Spoken voice responses directly from the glasses | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | PENDING             |
| F02 | Natural-sounding text-to-speech                  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F03 | Streaming voice output                           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F04 | Conversational turn-taking                       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F05 | Voice interruption / barge-in                    | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | PENDING             |
| F06 | Telugu AI voice                                  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F07 | English AI voice                                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F08 | Multilingual voice output                        | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F09 | Adjustable speech rate and volume                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F10 | Short spoken answers in public or while moving   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F11 | Detailed explanations on demand                  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F12 | Voice style and personality preferences          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F13 | Private-audio behavior and volume safeguards     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F14 | Voice confirmation before consequential actions  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F15 | Network-aware low-latency speech routing         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F16 | Offline speech output for basic commands         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| F17 | Spoken feedback on system and battery status     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## G. Second Brain — Long-Term Personal Intelligence

| ID  | Requirement                                                | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | ---------------------------------------------------------- | -------------- | ------------ | ------------- | ------- | ------------------- |
| G01 | Persistent long-term user memory                           | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G02 | Short-term working and conversational memory               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G03 | Remember user-requested facts and preferences              | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G04 | Remember personal projects, goals and plans                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G05 | Remember notes and ideas                                   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G06 | Remember dates, appointments and commitments               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G07 | Organize memories by time, place and topic                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G08 | Semantic memory search                                     | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G09 | Memory ingestion from permitted images and audio           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G10 | Contextual recall during voice conversations               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G11 | Timeline and episode memory                                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G12 | Relate memories through structured knowledge links         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G13 | Distinguish facts from model-generated inferences          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G14 | Maintain provenance for saved memories                     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G15 | Correct outdated or contradictory memories                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G16 | Personalized retrieval-augmented generation                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G17 | Local memory cache for offline use                         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G18 | End-to-end encrypted memory synchronization where feasible | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G19 | Privacy tiers for sensitive and temporary memories         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G20 | Review, edit, export and permanently delete memories       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G21 | Automated retention and expiration policies                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G22 | Prevent cross-user memory leakage                          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G23 | Support queries about earlier conversations or activities  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| G24 | Optional memory prompts: 'Should I remember this?'         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## H. People, Relationships and Familiar Faces

| ID  | Requirement                                                  | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | ------------------------------------------------------------ | -------------- | ------------ | ------------- | ------- | ------------------- |
| H01 | Create profiles for explicitly enrolled people               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H02 | Store names, nicknames and relationship information          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H03 | Store voluntarily provided birthdays and relevant dates      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H04 | Store consented interaction notes                            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H05 | Link authorized conversational history to profiles           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H06 | Opt-in facial enrollment with informed consent               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H07 | Recognize enrolled familiar faces when conditions permit     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H08 | Use uncertainty thresholds and reject ambiguous matches      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H09 | Optional authorized speaker recognition                      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H10 | Recall contextual information about familiar people          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H11 | Answer 'What did we discuss last time?' from approved memory | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H12 | Maintain interaction timelines and follow-up tasks           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H13 | Allow profile edits and corrections                          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H14 | Support consent withdrawal and removal of face templates     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H15 | Prevent identity claims about unknown people                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H16 | Block sensitive attribute inference from faces or voices     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| H17 | Prevent disclosure of private details to nearby listeners    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## I. Understanding, Reasoning and Multimodal AI

| ID  | Requirement                                              | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | -------------------------------------------------------- | -------------- | ------------ | ------------- | ------- | ------------------- |
| I01 | Interpret natural language and follow-up requests        | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I02 | Combine vision, audio, memory, location and time         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I03 | Understand situational references and ambiguity          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I04 | Perform multi-step reasoning                             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I05 | Select suitable model by task complexity                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I06 | Ask clarification only when necessary                    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I07 | Ground answers in observed or retrieved evidence         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I08 | Separate known facts from uncertain predictions          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I09 | Support real-time web research                           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I10 | Use tools and structured outputs                         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I11 | Handle long-running tasks with progress and cancellation | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I12 | Maintain contextual state across related requests        | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I13 | Recover from model failures and timeouts                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I14 | Prevent hallucinated memory or device actions            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I15 | Evaluate multilingual reasoning                          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I16 | Provide concise or detailed responses based on context   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I17 | Support configurable local/cloud AI processing           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| I18 | Track provider performance and accuracy                  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## J. Translation and Accessibility

| ID  | Requirement                                          | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | ---------------------------------------------------- | -------------- | ------------ | ------------- | ------- | ------------------- |
| J01 | Telugu-English two-way speech translation            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| J02 | Additional Indian languages                          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| J03 | Additional international languages                   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| J04 | Live speech translation with appropriate latency     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| J05 | Camera-based text translation                        | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| J06 | Translated voice playback                            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| J07 | Optional captioning on HUD or connected screen       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| J08 | Speaker-aware translation in consented conversations | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| J09 | Technical terminology and user glossary              | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| J10 | Offline translations where models permit             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| J11 | Readable transcription and accessibility settings    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| J12 | Descriptive audio for selected visual information    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| J13 | Accessibility-friendly controls and audio output     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| J14 | Translation accuracy and uncertainty testing         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## K. Autonomous Agents and Real-World Actions

| ID  | Requirement                                                        | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | ------------------------------------------------------------------ | -------------- | ------------ | ------------- | ------- | ------------------- |
| K01 | Create tasks, reminders, alarms and notes                          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K02 | Manage calendar through authorized integrations                    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K03 | Draft and send messages with appropriate approval                  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K04 | Read and summarize authorized emails                               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K05 | Perform internet research and comparisons                          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K06 | Build and execute multi-step plans                                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K07 | Call supported external APIs                                       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K08 | Search personal knowledge and stored documents                     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K09 | Connect to desktop and PC tools with authorization                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K10 | Execute approved automation workflows                              | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K11 | Use multiple specialized AI agents                                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K12 | Support background cloud tasks with user-defined limits            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K13 | Show task execution and approval status                            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K14 | Offer cancel, retry and resume controls                            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K15 | Require permission for purchases, messages and destructive actions | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K16 | Record action audit trails and execution results                   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K17 | Protect against prompt injection from observed content             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K18 | Prevent arbitrary command execution on connected systems           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K19 | Enforce bounded agent permissions and usage budgets                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| K20 | Provide proactive assistance with notification controls            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## L. Cloud, Storage and Sync

| ID  | Requirement                                              | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | -------------------------------------------------------- | -------------- | ------------ | ------------- | ------- | ------------------- |
| L01 | Operate with no phone attached                           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L02 | Maintain sufficient local OS and buffering storage       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L03 | Record captures offline to encrypted local storage       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L04 | Implement local media storage quotas                     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L05 | Support cloud object storage for photos and videos       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L06 | Use structured database for users, devices and tasks     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L07 | Use secure vector search for semantic memory retrieval   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L08 | Support optional phone storage and backup                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L09 | Support optional PC or NAS storage export                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L10 | Handle direct glasses-to-cloud synchronization           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L11 | Resume interrupted uploads                               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L12 | Deduplicate synchronized content                         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L13 | Prevent data loss during connection interruptions        | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L14 | Define per-user storage limits and retention             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L15 | Support user data export and portability                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L16 | Offer private local-only mode for supported functions    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L17 | Provide account and device restore procedures            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L18 | Support secure remote deletion and credential revocation | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| L19 | Monitor backup integrity and disaster recovery           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## M. AI Model Providers and Platform Integration

| ID  | Requirement                                                | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | ---------------------------------------------------------- | -------------- | ------------ | ------------- | ------- | ------------------- |
| M01 | Secure server-side provider gateway                        | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M02 | Integrate multimodal vision models                         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M03 | Integrate speech-to-text models                            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M04 | Integrate realtime conversational speech models            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M05 | Integrate text-to-speech models                            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M06 | Integrate video understanding models or temporal pipelines | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M07 | Integrate embedding and retrieval models                   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M08 | Support small on-device models                             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M09 | Support multiple cloud AI providers                        | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M10 | OpenRouter integration and provider allowlisting           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M11 | Intelligent model routing                                  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M12 | Provider failover and health checks                        | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M13 | Prompt and model version control                           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M14 | Per-user and device rate limits                            | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M15 | Enforce usage budgets and hard spending limits             | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M16 | Token, audio, image and video cost tracking                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M17 | Provider observability and safe logging                    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M18 | Tool schemas and validated execution contracts             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M19 | Secrets management and key rotation                        | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| M20 | Evaluate models on LensMate-specific tasks                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## N. Security, Consent and User Safety

| ID  | Requirement                                                 | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | ----------------------------------------------------------- | -------------- | ------------ | ------------- | ------- | ------------------- |
| N01 | Secure boot and signed firmware                             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N02 | Mutual or device-bound backend authentication               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N03 | Encrypt communications and stored sensitive data            | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N04 | Hardware-backed device identity where available             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N05 | Recording indicator and clear activation state              | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | PENDING             |
| N06 | Physical or independently enforced microphone mute          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N07 | Explicit permission for sensitive capture and memories      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N08 | Visible and controllable continuous-observation sessions    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N09 | No covert surveillance functionality                        | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N10 | Consented face enrollment and deletion                      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N11 | Fine-grained API/tool permissions                           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N12 | Biometric and personally identifiable data minimization     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N13 | Owner verification for sensitive operations                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N14 | Remote account/device revocation                            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N15 | Prevent cloud storage from exposing personal captures       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N16 | Rate limiting and abuse detection                           | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N17 | Prompt-injection and malicious-content defense              | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N18 | Third-party component vulnerability management              | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N19 | Independent penetration and privacy testing                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N20 | Applicable Indian and target-market privacy compliance      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N21 | Radio, battery, charging and electrical product compliance  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N22 | Safe operation while walking, driving or in hazardous areas | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| N23 | Incident response and security update process               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## O. Battery, Latency and Wearability

| ID  | Requirement                                                  | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | ------------------------------------------------------------ | -------------- | ------------ | ------------- | ------- | ------------------- |
| O01 | Set realistic product weight and comfort limits              | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O02 | Measure idle / standby battery life                          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O03 | Measure continuous voice session battery life                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O04 | Measure periodic vision battery life                         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O05 | Measure continuous video capture battery life                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O06 | Measure Wi-Fi and cellular power consumption separately      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O07 | Optimize inference and sensor wake/sleep scheduling          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O08 | Prevent uncomfortable frame temperature                      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O09 | Measure thermal throttling and sustained performance         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O10 | Set acceptable voice response latency target                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O11 | Set acceptable camera question-answering latency target      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O12 | Measure network usage and connection recovery                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O13 | Design charging-case battery capacity                        | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O14 | Validate repeated charge/discharge life                      | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O15 | Test fit for different head sizes and prescription lenses    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O16 | Test outdoor light, wind noise and crowded settings          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| O17 | Evaluate durability, drop, sweat and temperature performance | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## P. Optional Companion App and Control Center

| ID  | Requirement                                                    | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | -------------------------------------------------------------- | -------------- | ------------ | ------------- | ------- | ------------------- |
| P01 | Optional Android application                                   | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P02 | Optional iOS application                                       | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P03 | View stored photos and video                                   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P04 | Browse and manage second-brain memories                        | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P05 | Manage known-person profiles and consent                       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P06 | Review AI task history                                         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P07 | Manage connected service permissions                           | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P08 | Configure hardware and software settings                       | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P09 | Show battery, network and firmware diagnostics                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P10 | Access remote device management                                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P11 | Export and delete user data                                    | IN_PROGRESS    | PARTIAL      | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P12 | Provide optional offline backups                               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P13 | Manage subscription, provider usage and cost                   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P14 | Accessible, premium user experience                            | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| P15 | Never require the phone for routine voice and vision operation | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |

## Q. Verification, Prototype and Release

| ID  | Requirement                                               | Implementation | Verification | Review        | Blocker | Hardware validation |
| --- | --------------------------------------------------------- | -------------- | ------------ | ------------- | ------- | ------------------- |
| Q01 | Document hardware requirements and BOM                    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q02 | Validate chip and component availability                  | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q03 | Obtain compatible evaluation boards or developer hardware | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q04 | Prototype standalone audio input/output                   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q05 | Prototype direct Wi-Fi AI connectivity                    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q06 | Prototype image and video capture                         | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q07 | Validate actual on-glasses OS and drivers                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q08 | Validate AI voice loop with no phone attached             | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q09 | Validate local commands while offline                     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q10 | Validate real vision questions through glasses camera     | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q11 | Validate saved memories across sessions                   | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q12 | Validate consented people-memory workflows                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q13 | Run end-to-end hardware/software integration tests        | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q14 | Measure accuracy, latency, bandwidth, battery and heat    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q15 | Run extended hardware soak tests                          | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q16 | Run security and privacy acceptance tests                 | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q17 | Test firmware updates, rollback and recovery              | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q18 | Test manufacturing and device provisioning                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q19 | Validate applicable regional certifications               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q20 | Complete controlled real-world user trials                | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q21 | Conduct independent engineering review                    | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
| Q22 | Pass production readiness and release gates               | NOT_STARTED    | NOT_TESTED   | NOT_REQUESTED | NONE    | NOT_APPLICABLE      |
