# Provider privacy, model choices and capability limits (BLOCKER-006)

Recorded 2026-10-24. Sources: LensMate-v9 section 10 and Amendments 2026-10-20C (OpenRouter, status
PROPOSED_AMENDMENT, PENDING_OWNER_APPROVAL, with section C.6 also reading "CONFIRMED_OWNER_CONFIGURATION") and
2026-10-20D (hosting, PENDING_OWNER_APPROVAL); LensMate-Goal Amendment 2026-10-20C (LM-07 to LM-10); Engineering
Standards amendments. Prices are OpenRouter's public catalogue read on 2026-10-24. They change, so they must be
re-read before any live use.

## 1. Status conflict to resolve (owner)

The OpenRouter amendment header says PENDING_OWNER_APPROVAL, while section C.6 says the provider is
CONFIRMED_OWNER_CONFIGURATION. The owner's current instruction treats OpenRouter as the approved gateway. Confirm
the approval in writing, and record the date, in `blocker.txt`. Until then no live call is made.

## 2. Key name

The amendment requires `OPENROUTER_API_KEY`, held only in the broker's server environment. BLOCKER-006 earlier listed
`PROVIDER_AI_KEY`. The broker and its configuration use `OPENROUTER_API_KEY` (or `OPENROUTER_API_KEY_FILE`). The
old name is retired.

## 3. Verified privacy facts (OpenRouter documentation, read 2026-10-24)

- OpenRouter does not store prompts or responses unless the account opts in to private input and output logging, or
  to letting OpenRouter use inputs and outputs for improvement. Both are off by default.
- OpenRouter stores request metadata (token counts, latency) for reporting. It does not store content for that purpose.
- Routing to a provider that may retain or train on data is controlled per request: `provider.zdr: true` restricts
  routing to zero-data-retention endpoints; `provider.data_collection: "deny"` excludes endpoints that may store data
  non-transiently and train on it.
- The broker sends both controls on every request (`services/broker/src/provider.ts`, tested in `provider.test.ts`).

Not verified: which upstream endpoints serve each allowlisted model under these controls at the time of the call. The
owner must check the endpoints for each model before live use, and record the result here.

## 4. Model choices

Update 2026-10-24 (OWNER-DECISION-003): the live allowlist is google/gemini-3.1-flash-lite (text),
google/gemini-3.1-flash-lite:online (web research) and google/gemini-3.5-flash-lite (vision), because the 2.5 models
had no zero-data-retention endpoint. The table below is the earlier proposal, kept for history.

### Earlier proposal

| Route                              | Model                          | Input USD per 1M tokens | Output USD per 1M tokens | Context   | Input modalities (catalogue)    |
| ---------------------------------- | ------------------------------ | ----------------------- | ------------------------ | --------- | ------------------------------- |
| Text: conversation and translation | `google/gemini-2.5-flash-lite` | 0.10                    | 0.40                     | 1,048,576 | text, image, file, audio, video |
| Vision                             | `google/gemini-2.5-flash`      | 0.30                    | 2.50                     | 1,048,576 | file, image, text, audio, video |

Considered and not allowlisted: `anthropic/claude-haiku-5.5` (1.00 / 5.00 per 1M tokens, context 1,000,000) costs
several times more for the text route. Its quality for Telugu and Hindi is not verified. The allowlist can be widened
only by a reviewed code change with a price snapshot.

Rupee cost: the broker converts USD to paise with `BROKER_FX_PAISE_PER_USD`, an owner setting with no default. Until the
owner sets the rate, no rupee figure is given here. Cost per request is computed from the token counts the provider
reports, rounded up.

## 5. What OpenRouter alone cannot provide (verified against the catalogue and the amendment C.4)

| Capability                                      | Through OpenRouter alone?                                                                                                                           | Basis                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Conversational answers                          | Yes, as text completion                                                                                                                             | Catalogue text output                     |
| Translation (English, Telugu, Hindi, mixed)     | Only as LLM text translation; quality for Telugu and Hindi is NOT VERIFIED                                                                          | No measurement exists yet (v9 section 12) |
| Image questions (vision)                        | Yes, for the allowlisted vision model                                                                                                               | Catalogue image input                     |
| Image token ceiling for worst-case reservation  | Not known. The vision route stays off until the owner measures it                                                                                   | Amendment C.5                             |
| Speech recognition with streaming partial words | NOT VERIFIED. The catalogue lists audio input for some models, but there is no streaming recognition API. Latency and word-level output are unknown | v9 section 6.1; amendment C.4             |
| Speech output (text to speech)                  | NO. The allowlisted models have text output only                                                                                                    | Catalogue output modalities               |
| Custom vocabulary (F27)                         | Not verifiable through OpenRouter                                                                                                                   | v9 section 6.1                            |

Consequence: speech recognition and speech output keep the on-device or approved-provider route (v9 section 6; amendment
C.4). Choosing a speech provider is a separate owner decision. No speech provider is selected, and the broker has no
speech route.

## 6. Training restriction (G21) and disclosure (G22)

- Request-level restriction: `data_collection: "deny"` is set on every call. Account-level settings are owner actions.
- Disclosure: before any cloud processing, the app must disclose that audio, text or photos go to an authorized provider
  (G22). This is not built. It is a precondition for live use.

## 7. Owner decisions (none made by the agent)

1. Confirm the OpenRouter approval status (section 1).
2. Approve the model allowlist and price snapshot (section 4).
3. Set the monthly cap (proposed INR 500, 50000 paise) and the exchange rate. The broker refuses live mode until
   `BROKER_OWNER_CAP_CONFIRMATION_PAISE` equals `BROKER_MONTHLY_CAP_PAISE`.
4. Check the upstream endpoints for each model under zdr and data_collection deny (section 3), and record the result.
5. Set the OpenRouter account privacy settings and an account-level spend limit (LM-09). The broker's own limit is the
   enforced one (C.5).
6. Approve the disclosure text for cloud processing (G22) before any live call.
7. Choose a speech provider, or confirm on-device recognition and speech output (section 5).
8. Choose the hosting: the shared Hostinger VPS under the isolation rules, or the planned separate VPS (a candidate,
   not purchased). The broker's hostname is an owner decision.
9. Approve any real-provider test, with a limited budget (Engineering Standards, Tests).

## 8. Retention

The broker keeps no prompt, reply, image or audio. Its ledger keeps the month, the client id, the amounts in paise,
reservation states and the daily request count. Choose how long ledger rows are kept (owner decision). Container logs
hold outcome, cost and latency only; their retention is also an owner decision.
