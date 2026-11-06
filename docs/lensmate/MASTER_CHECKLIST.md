# LensMate Master Checklist

Source: owner-supplied master checklist (2026-11-06). Each item has a stable ID.
Status values: NOT_STARTED / IN_PROGRESS / IMPLEMENTED / VERIFIED / BLOCKED / INDEPENDENT_REVIEW_PENDING.

Status is updated only with evidence recorded in VERIFICATION_EVIDENCE.md. Hardware-dependent items may be
IMPLEMENTED (software side) but never VERIFIED from simulation alone.

Dependencies and acceptance criteria are filled in when an item is selected for work.

## A. Smart Glasses Hardware
| ID | Requirement | Status |
|---|---|---|
| A01 | Lightweight, comfortable wearable frame | NOT_STARTED |
| A02 | Built-in first-person camera with appropriate field of view | NOT_STARTED |
| A03 | Built-in multi-microphone array | NOT_STARTED |
| A04 | Integrated left and right open-ear speakers | NOT_STARTED |
| A05 | On-glasses application processor / SoC | NOT_STARTED |
| A06 | Neural processing capability for local AI | NOT_STARTED |
| A07 | RAM capacity sized for firmware, audio and model workloads | NOT_STARTED |
| A08 | Internal flash for OS, models and temporary media | NOT_STARTED |
| A09 | Rechargeable battery and protected charging circuitry | NOT_STARTED |
| A10 | Wi-Fi connectivity for direct internet access | NOT_STARTED |
| A11 | Bluetooth for optional accessories and pairing | NOT_STARTED |
| A12 | Physical camera capture control | NOT_STARTED |
| A13 | Physical microphone mute / privacy control | NOT_STARTED |
| A14 | Touch, gesture or physical-button interface | NOT_STARTED |
| A15 | Camera-active recording indicator | NOT_STARTED |
| A16 | Microphone / listening state indication | NOT_STARTED |
| A17 | IMU / accelerometer / gyroscope sensors | NOT_STARTED |
| A18 | Ambient light and proximity sensing where justified | NOT_STARTED |
| A19 | Thermal sensors and overheating protection | NOT_STARTED |
| A20 | USB-C or appropriate charging connector | NOT_STARTED |
| A21 | Charging case and battery-management strategy | NOT_STARTED |
| A22 | Prescription-lens compatibility | NOT_STARTED |
| A23 | Weather, sweat and dust protection validation | NOT_STARTED |
| A24 | Optional single-eye or binocular HUD display | NOT_STARTED |
| A25 | Optional GNSS / location architecture | NOT_STARTED |
| A26 | Optional embedded cellular radio and eSIM | NOT_STARTED |
| A27 | Repairability and replaceable wear components | NOT_STARTED |
| A28 | Secure boot and hardware root of trust | NOT_STARTED |

## B. Standalone OS, Firmware and Connectivity
| ID | Requirement | Status |
|---|---|---|
| B01 | Boot, configure and operate glasses without a smartphone | NOT_STARTED |
| B02 | Direct Wi-Fi connection and reconnect management | NOT_STARTED |
| B03 | First-time setup without a mandatory phone app | NOT_STARTED |
| B04 | Wi-Fi credential onboarding without insecure provisioning | NOT_STARTED |
| B05 | Device-to-cloud encrypted authentication | NOT_STARTED |
| B06 | Device enrollment and owner binding | NOT_STARTED |
| B07 | Secure firmware and OS updates | NOT_STARTED |
| B08 | Signed over-the-air update packages | NOT_STARTED |
| B09 | Rollback after failed firmware updates | NOT_STARTED |
| B10 | Camera, microphone and speaker hardware drivers | NOT_STARTED |
| B11 | Audio routing and echo cancellation | NOT_STARTED |
| B12 | Camera capture and sensor pipelines | NOT_STARTED |
| B13 | Wake-word and low-power listening service | NOT_STARTED |
| B14 | Background task and lifecycle manager | NOT_STARTED |
| B15 | On-device AI runtime | NOT_STARTED |
| B16 | Offline command router | NOT_STARTED |
| B17 | Local queue and deferred synchronization | NOT_STARTED |
| B18 | Power-saving sleep and wake states | NOT_STARTED |
| B19 | Network loss recovery and automatic reconnection | NOT_STARTED |
| B20 | Local clock and timestamp continuity | NOT_STARTED |
| B21 | Remote device lock and credential revocation | NOT_STARTED |
| B22 | Factory reset and secure data erasure | NOT_STARTED |
| B23 | Diagnostics and crash recovery | NOT_STARTED |
| B24 | Optional eSIM provisioning and cellular data service | NOT_STARTED |
| B25 | Optional phone, PC and accessory pairing | NOT_STARTED |
| B26 | Direct pairing with the cloud account independently of a phone | NOT_STARTED |

## C. Vision and Real-World Perception
| ID | Requirement | Status |
|---|---|---|
| C01 | Take images directly with glasses camera | NOT_STARTED |
| C02 | Analyze live camera frames | NOT_STARTED |
| C03 | Voice-triggered visual question answering | NOT_STARTED |
| C04 | Recognize everyday objects and environmental features | NOT_STARTED |
| C05 | Understand scene layout and visual relationships | NOT_STARTED |
| C06 | Read signs, books, receipts and labels | NOT_STARTED |
| C07 | Read and explain documents, graphs and diagrams | NOT_STARTED |
| C08 | Understand product packaging and ingredients | NOT_STARTED |
| C09 | Visual product search and comparison | NOT_STARTED |
| C10 | Detect visual scene changes | NOT_STARTED |
| C11 | Track selected objects across frames | NOT_STARTED |
| C12 | Identify apparent obstacles and hazards without safety guarantees | NOT_STARTED |
| C13 | Describe surrounding environment in natural language | NOT_STARTED |
| C14 | Support 'What is this?' and 'Look at that' commands | NOT_STARTED |
| C15 | Follow user-directed visual attention | NOT_STARTED |
| C16 | Combine speech and camera context in one query | NOT_STARTED |
| C17 | Use frame sampling to control cost and bandwidth | NOT_STARTED |
| C18 | Apply uncertainty and confidence safeguards | NOT_STARTED |
| C19 | Optional spatial mapping / object localization | NOT_STARTED |
| C20 | Optional display-based visual overlays | NOT_STARTED |
| C21 | Respect restricted environments and camera privacy | NOT_STARTED |

## D. Continuous Video Understanding
| ID | Requirement | Status |
|---|---|---|
| D01 | First-person video capture | NOT_STARTED |
| D02 | Synchronize video and microphone audio | NOT_STARTED |
| D03 | Support configurable capture duration and resolution | NOT_STARTED |
| D04 | Support short rolling video buffer with explicit activation | NOT_STARTED |
| D05 | Understand temporal events rather than independent frames alone | NOT_STARTED |
| D06 | Summarize recorded activity | NOT_STARTED |
| D07 | Search by timestamp and natural-language descriptions | NOT_STARTED |
| D08 | Find important moments in previously saved videos | NOT_STARTED |
| D09 | Answer 'What happened just now?' using permitted buffer | NOT_STARTED |
| D10 | Identify action sequences and changing scenes | NOT_STARTED |
| D11 | Extract transcripts and scene summaries | NOT_STARTED |
| D12 | Combine speech, sound and visual event data | NOT_STARTED |
| D13 | Maintain bounded live observation sessions | NOT_STARTED |
| D14 | Provide optional event-triggered clip saving | NOT_STARTED |
| D15 | Pause or stop recording instantly | NOT_STARTED |
| D16 | Implement visible capture indicator and consent policies | NOT_STARTED |
| D17 | Compress, encrypt and sync clips efficiently | NOT_STARTED |
| D18 | Automatically manage retention and storage pressure | NOT_STARTED |
| D19 | Handle interrupted recordings safely | NOT_STARTED |
| D20 | Test video accuracy against real recordings | NOT_STARTED |

## E. Hear — Audio Intelligence
| ID | Requirement | Status |
|---|---|---|
| E01 | Wake-word or explicit activation | NOT_STARTED |
| E02 | Voice activity detection | NOT_STARTED |
| E03 | Automatic speech recognition | NOT_STARTED |
| E04 | Natural conversational listening | NOT_STARTED |
| E05 | Telugu speech recognition | NOT_STARTED |
| E06 | English speech recognition | NOT_STARTED |
| E07 | Mixed Telugu-English conversations | NOT_STARTED |
| E08 | Background noise reduction | NOT_STARTED |
| E09 | Acoustic echo cancellation | NOT_STARTED |
| E10 | Speaker diarization for authorized recordings | NOT_STARTED |
| E11 | Environmental sound recognition | NOT_STARTED |
| E12 | Alarms, horns and important acoustic cue identification | NOT_STARTED |
| E13 | Question understanding while viewing surroundings | NOT_STARTED |
| E14 | Audio recording with clear user control | NOT_STARTED |
| E15 | Authorized meeting and lecture transcription | NOT_STARTED |
| E16 | Conversation summaries | NOT_STARTED |
| E17 | Extract tasks and spoken commitments | NOT_STARTED |
| E18 | Handle interruptions and overlapping speakers | NOT_STARTED |
| E19 | Adaptive microphone sensitivity | NOT_STARTED |
| E20 | Offline recognition of selected commands | NOT_STARTED |
| E21 | Emergency-stop / mute voice command | NOT_STARTED |

## F. Talk — Jarvis-Like Voice
| ID | Requirement | Status |
|---|---|---|
| F01 | Spoken voice responses directly from the glasses | NOT_STARTED |
| F02 | Natural-sounding text-to-speech | NOT_STARTED |
| F03 | Streaming voice output | NOT_STARTED |
| F04 | Conversational turn-taking | NOT_STARTED |
| F05 | Voice interruption / barge-in | NOT_STARTED |
| F06 | Telugu AI voice | NOT_STARTED |
| F07 | English AI voice | NOT_STARTED |
| F08 | Multilingual voice output | NOT_STARTED |
| F09 | Adjustable speech rate and volume | NOT_STARTED |
| F10 | Short spoken answers in public or while moving | NOT_STARTED |
| F11 | Detailed explanations on demand | NOT_STARTED |
| F12 | Voice style and personality preferences | NOT_STARTED |
| F13 | Private-audio behavior and volume safeguards | NOT_STARTED |
| F14 | Voice confirmation before consequential actions | NOT_STARTED |
| F15 | Network-aware low-latency speech routing | NOT_STARTED |
| F16 | Offline speech output for basic commands | NOT_STARTED |
| F17 | Spoken feedback on system and battery status | NOT_STARTED |

## G. Second Brain — Long-Term Personal Intelligence
| ID | Requirement | Status |
|---|---|---|
| G01 | Persistent long-term user memory | NOT_STARTED |
| G02 | Short-term working and conversational memory | NOT_STARTED |
| G03 | Remember user-requested facts and preferences | NOT_STARTED |
| G04 | Remember personal projects, goals and plans | NOT_STARTED |
| G05 | Remember notes and ideas | NOT_STARTED |
| G06 | Remember dates, appointments and commitments | NOT_STARTED |
| G07 | Organize memories by time, place and topic | NOT_STARTED |
| G08 | Semantic memory search | NOT_STARTED |
| G09 | Memory ingestion from permitted images and audio | NOT_STARTED |
| G10 | Contextual recall during voice conversations | NOT_STARTED |
| G11 | Timeline and episode memory | NOT_STARTED |
| G12 | Relate memories through structured knowledge links | NOT_STARTED |
| G13 | Distinguish facts from model-generated inferences | NOT_STARTED |
| G14 | Maintain provenance for saved memories | NOT_STARTED |
| G15 | Correct outdated or contradictory memories | NOT_STARTED |
| G16 | Personalized retrieval-augmented generation | NOT_STARTED |
| G17 | Local memory cache for offline use | NOT_STARTED |
| G18 | End-to-end encrypted memory synchronization where feasible | NOT_STARTED |
| G19 | Privacy tiers for sensitive and temporary memories | NOT_STARTED |
| G20 | Review, edit, export and permanently delete memories | NOT_STARTED |
| G21 | Automated retention and expiration policies | NOT_STARTED |
| G22 | Prevent cross-user memory leakage | NOT_STARTED |
| G23 | Support queries about earlier conversations or activities | NOT_STARTED |
| G24 | Optional memory prompts: 'Should I remember this?' | NOT_STARTED |

## H. People, Relationships and Familiar Faces
| ID | Requirement | Status |
|---|---|---|
| H01 | Create profiles for explicitly enrolled people | NOT_STARTED |
| H02 | Store names, nicknames and relationship information | NOT_STARTED |
| H03 | Store voluntarily provided birthdays and relevant dates | NOT_STARTED |
| H04 | Store consented interaction notes | NOT_STARTED |
| H05 | Link authorized conversational history to profiles | NOT_STARTED |
| H06 | Opt-in facial enrollment with informed consent | NOT_STARTED |
| H07 | Recognize enrolled familiar faces when conditions permit | NOT_STARTED |
| H08 | Use uncertainty thresholds and reject ambiguous matches | NOT_STARTED |
| H09 | Optional authorized speaker recognition | NOT_STARTED |
| H10 | Recall contextual information about familiar people | NOT_STARTED |
| H11 | Answer 'What did we discuss last time?' from approved memory | NOT_STARTED |
| H12 | Maintain interaction timelines and follow-up tasks | NOT_STARTED |
| H13 | Allow profile edits and corrections | NOT_STARTED |
| H14 | Support consent withdrawal and removal of face templates | NOT_STARTED |
| H15 | Prevent identity claims about unknown people | NOT_STARTED |
| H16 | Block sensitive attribute inference from faces or voices | NOT_STARTED |
| H17 | Prevent disclosure of private details to nearby listeners | NOT_STARTED |

## I. Understanding, Reasoning and Multimodal AI
| ID | Requirement | Status |
|---|---|---|
| I01 | Interpret natural language and follow-up requests | NOT_STARTED |
| I02 | Combine vision, audio, memory, location and time | NOT_STARTED |
| I03 | Understand situational references and ambiguity | NOT_STARTED |
| I04 | Perform multi-step reasoning | NOT_STARTED |
| I05 | Select suitable model by task complexity | NOT_STARTED |
| I06 | Ask clarification only when necessary | NOT_STARTED |
| I07 | Ground answers in observed or retrieved evidence | NOT_STARTED |
| I08 | Separate known facts from uncertain predictions | NOT_STARTED |
| I09 | Support real-time web research | NOT_STARTED |
| I10 | Use tools and structured outputs | NOT_STARTED |
| I11 | Handle long-running tasks with progress and cancellation | NOT_STARTED |
| I12 | Maintain contextual state across related requests | NOT_STARTED |
| I13 | Recover from model failures and timeouts | NOT_STARTED |
| I14 | Prevent hallucinated memory or device actions | NOT_STARTED |
| I15 | Evaluate multilingual reasoning | NOT_STARTED |
| I16 | Provide concise or detailed responses based on context | NOT_STARTED |
| I17 | Support configurable local/cloud AI processing | NOT_STARTED |
| I18 | Track provider performance and accuracy | NOT_STARTED |

## J. Translation and Accessibility
| ID | Requirement | Status |
|---|---|---|
| J01 | Telugu-English two-way speech translation | NOT_STARTED |
| J02 | Additional Indian languages | NOT_STARTED |
| J03 | Additional international languages | NOT_STARTED |
| J04 | Live speech translation with appropriate latency | NOT_STARTED |
| J05 | Camera-based text translation | NOT_STARTED |
| J06 | Translated voice playback | NOT_STARTED |
| J07 | Optional captioning on HUD or connected screen | NOT_STARTED |
| J08 | Speaker-aware translation in consented conversations | NOT_STARTED |
| J09 | Technical terminology and user glossary | NOT_STARTED |
| J10 | Offline translations where models permit | NOT_STARTED |
| J11 | Readable transcription and accessibility settings | NOT_STARTED |
| J12 | Descriptive audio for selected visual information | NOT_STARTED |
| J13 | Accessibility-friendly controls and audio output | NOT_STARTED |
| J14 | Translation accuracy and uncertainty testing | NOT_STARTED |

## K. Autonomous Agents and Real-World Actions
| ID | Requirement | Status |
|---|---|---|
| K01 | Create tasks, reminders, alarms and notes | NOT_STARTED |
| K02 | Manage calendar through authorized integrations | NOT_STARTED |
| K03 | Draft and send messages with appropriate approval | NOT_STARTED |
| K04 | Read and summarize authorized emails | NOT_STARTED |
| K05 | Perform internet research and comparisons | NOT_STARTED |
| K06 | Build and execute multi-step plans | NOT_STARTED |
| K07 | Call supported external APIs | NOT_STARTED |
| K08 | Search personal knowledge and stored documents | NOT_STARTED |
| K09 | Connect to desktop and PC tools with authorization | NOT_STARTED |
| K10 | Execute approved automation workflows | NOT_STARTED |
| K11 | Use multiple specialized AI agents | NOT_STARTED |
| K12 | Support background cloud tasks with user-defined limits | NOT_STARTED |
| K13 | Show task execution and approval status | NOT_STARTED |
| K14 | Offer cancel, retry and resume controls | NOT_STARTED |
| K15 | Require permission for purchases, messages and destructive actions | NOT_STARTED |
| K16 | Record action audit trails and execution results | NOT_STARTED |
| K17 | Protect against prompt injection from observed content | NOT_STARTED |
| K18 | Prevent arbitrary command execution on connected systems | NOT_STARTED |
| K19 | Enforce bounded agent permissions and usage budgets | NOT_STARTED |
| K20 | Provide proactive assistance with notification controls | NOT_STARTED |

## L. Cloud, Storage and Sync
| ID | Requirement | Status |
|---|---|---|
| L01 | Operate with no phone attached | NOT_STARTED |
| L02 | Maintain sufficient local OS and buffering storage | NOT_STARTED |
| L03 | Record captures offline to encrypted local storage | NOT_STARTED |
| L04 | Implement local media storage quotas | NOT_STARTED |
| L05 | Support cloud object storage for photos and videos | NOT_STARTED |
| L06 | Use structured database for users, devices and tasks | NOT_STARTED |
| L07 | Use secure vector search for semantic memory retrieval | NOT_STARTED |
| L08 | Support optional phone storage and backup | NOT_STARTED |
| L09 | Support optional PC or NAS storage export | NOT_STARTED |
| L10 | Handle direct glasses-to-cloud synchronization | NOT_STARTED |
| L11 | Resume interrupted uploads | NOT_STARTED |
| L12 | Deduplicate synchronized content | NOT_STARTED |
| L13 | Prevent data loss during connection interruptions | NOT_STARTED |
| L14 | Define per-user storage limits and retention | NOT_STARTED |
| L15 | Support user data export and portability | NOT_STARTED |
| L16 | Offer private local-only mode for supported functions | NOT_STARTED |
| L17 | Provide account and device restore procedures | NOT_STARTED |
| L18 | Support secure remote deletion and credential revocation | NOT_STARTED |
| L19 | Monitor backup integrity and disaster recovery | NOT_STARTED |

## M. AI Model Providers and Platform Integration
| ID | Requirement | Status |
|---|---|---|
| M01 | Secure server-side provider gateway | NOT_STARTED |
| M02 | Integrate multimodal vision models | NOT_STARTED |
| M03 | Integrate speech-to-text models | NOT_STARTED |
| M04 | Integrate realtime conversational speech models | NOT_STARTED |
| M05 | Integrate text-to-speech models | NOT_STARTED |
| M06 | Integrate video understanding models or temporal pipelines | NOT_STARTED |
| M07 | Integrate embedding and retrieval models | NOT_STARTED |
| M08 | Support small on-device models | NOT_STARTED |
| M09 | Support multiple cloud AI providers | NOT_STARTED |
| M10 | OpenRouter integration and provider allowlisting | NOT_STARTED |
| M11 | Intelligent model routing | NOT_STARTED |
| M12 | Provider failover and health checks | NOT_STARTED |
| M13 | Prompt and model version control | NOT_STARTED |
| M14 | Per-user and device rate limits | NOT_STARTED |
| M15 | Enforce usage budgets and hard spending limits | NOT_STARTED |
| M16 | Token, audio, image and video cost tracking | NOT_STARTED |
| M17 | Provider observability and safe logging | NOT_STARTED |
| M18 | Tool schemas and validated execution contracts | NOT_STARTED |
| M19 | Secrets management and key rotation | NOT_STARTED |
| M20 | Evaluate models on LensMate-specific tasks | NOT_STARTED |

## N. Security, Consent and User Safety
| ID | Requirement | Status |
|---|---|---|
| N01 | Secure boot and signed firmware | NOT_STARTED |
| N02 | Mutual or device-bound backend authentication | NOT_STARTED |
| N03 | Encrypt communications and stored sensitive data | NOT_STARTED |
| N04 | Hardware-backed device identity where available | NOT_STARTED |
| N05 | Recording indicator and clear activation state | NOT_STARTED |
| N06 | Physical or independently enforced microphone mute | NOT_STARTED |
| N07 | Explicit permission for sensitive capture and memories | NOT_STARTED |
| N08 | Visible and controllable continuous-observation sessions | NOT_STARTED |
| N09 | No covert surveillance functionality | NOT_STARTED |
| N10 | Consented face enrollment and deletion | NOT_STARTED |
| N11 | Fine-grained API/tool permissions | NOT_STARTED |
| N12 | Biometric and personally identifiable data minimization | NOT_STARTED |
| N13 | Owner verification for sensitive operations | NOT_STARTED |
| N14 | Remote account/device revocation | NOT_STARTED |
| N15 | Prevent cloud storage from exposing personal captures | NOT_STARTED |
| N16 | Rate limiting and abuse detection | NOT_STARTED |
| N17 | Prompt-injection and malicious-content defense | NOT_STARTED |
| N18 | Third-party component vulnerability management | NOT_STARTED |
| N19 | Independent penetration and privacy testing | NOT_STARTED |
| N20 | Applicable Indian and target-market privacy compliance | NOT_STARTED |
| N21 | Radio, battery, charging and electrical product compliance | NOT_STARTED |
| N22 | Safe operation while walking, driving or in hazardous areas | NOT_STARTED |
| N23 | Incident response and security update process | NOT_STARTED |

## O. Battery, Latency and Wearability
| ID | Requirement | Status |
|---|---|---|
| O01 | Set realistic product weight and comfort limits | NOT_STARTED |
| O02 | Measure idle / standby battery life | NOT_STARTED |
| O03 | Measure continuous voice session battery life | NOT_STARTED |
| O04 | Measure periodic vision battery life | NOT_STARTED |
| O05 | Measure continuous video capture battery life | NOT_STARTED |
| O06 | Measure Wi-Fi and cellular power consumption separately | NOT_STARTED |
| O07 | Optimize inference and sensor wake/sleep scheduling | NOT_STARTED |
| O08 | Prevent uncomfortable frame temperature | NOT_STARTED |
| O09 | Measure thermal throttling and sustained performance | NOT_STARTED |
| O10 | Set acceptable voice response latency target | NOT_STARTED |
| O11 | Set acceptable camera question-answering latency target | NOT_STARTED |
| O12 | Measure network usage and connection recovery | NOT_STARTED |
| O13 | Design charging-case battery capacity | NOT_STARTED |
| O14 | Validate repeated charge/discharge life | NOT_STARTED |
| O15 | Test fit for different head sizes and prescription lenses | NOT_STARTED |
| O16 | Test outdoor light, wind noise and crowded settings | NOT_STARTED |
| O17 | Evaluate durability, drop, sweat and temperature performance | NOT_STARTED |

## P. Optional Companion App and Control Center
| ID | Requirement | Status |
|---|---|---|
| P01 | Optional Android application | NOT_STARTED |
| P02 | Optional iOS application | NOT_STARTED |
| P03 | View stored photos and video | NOT_STARTED |
| P04 | Browse and manage second-brain memories | NOT_STARTED |
| P05 | Manage known-person profiles and consent | NOT_STARTED |
| P06 | Review AI task history | NOT_STARTED |
| P07 | Manage connected service permissions | NOT_STARTED |
| P08 | Configure hardware and software settings | NOT_STARTED |
| P09 | Show battery, network and firmware diagnostics | NOT_STARTED |
| P10 | Access remote device management | NOT_STARTED |
| P11 | Export and delete user data | NOT_STARTED |
| P12 | Provide optional offline backups | NOT_STARTED |
| P13 | Manage subscription, provider usage and cost | NOT_STARTED |
| P14 | Accessible, premium user experience | NOT_STARTED |
| P15 | Never require the phone for routine voice and vision operation | NOT_STARTED |

## Q. Verification, Prototype and Release
| ID | Requirement | Status |
|---|---|---|
| Q01 | Document hardware requirements and BOM | NOT_STARTED |
| Q02 | Validate chip and component availability | NOT_STARTED |
| Q03 | Obtain compatible evaluation boards or developer hardware | NOT_STARTED |
| Q04 | Prototype standalone audio input/output | NOT_STARTED |
| Q05 | Prototype direct Wi-Fi AI connectivity | NOT_STARTED |
| Q06 | Prototype image and video capture | NOT_STARTED |
| Q07 | Validate actual on-glasses OS and drivers | NOT_STARTED |
| Q08 | Validate AI voice loop with no phone attached | NOT_STARTED |
| Q09 | Validate local commands while offline | NOT_STARTED |
| Q10 | Validate real vision questions through glasses camera | NOT_STARTED |
| Q11 | Validate saved memories across sessions | NOT_STARTED |
| Q12 | Validate consented people-memory workflows | NOT_STARTED |
| Q13 | Run end-to-end hardware/software integration tests | NOT_STARTED |
| Q14 | Measure accuracy, latency, bandwidth, battery and heat | NOT_STARTED |
| Q15 | Run extended hardware soak tests | NOT_STARTED |
| Q16 | Run security and privacy acceptance tests | NOT_STARTED |
| Q17 | Test firmware updates, rollback and recovery | NOT_STARTED |
| Q18 | Test manufacturing and device provisioning | NOT_STARTED |
| Q19 | Validate applicable regional certifications | NOT_STARTED |
| Q20 | Complete controlled real-world user trials | NOT_STARTED |
| Q21 | Conduct independent engineering review | NOT_STARTED |
| Q22 | Pass production readiness and release gates | NOT_STARTED |
