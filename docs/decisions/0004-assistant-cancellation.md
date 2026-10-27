# 0004 — Assistant cancellation and spending

Status: IMPLEMENTED on dev (2026-10-25). Tests: src/ai/cancellation.test.ts, src/ai/run-guard.test.ts.

## What Stop does now

1. Stops microphone input and spoken output.
2. Cancels the request the phone is waiting for: the phone aborts its HTTP request (the transport already accepted an
   AbortSignal) and stops the agent loop before its next step.
3. Drops any late answer. A cancelled or replaced request never appends a message, never speaks, and never runs a
   delayed phone action. Actions are only ever proposed; the user must tap Confirm.
4. Leaving the screen or unmounting cancels the current request and stops speech and the microphone.

## What cancellation cannot do

- It cannot stop the broker. If the request already reached the broker, the broker may still complete it and charge the
  provider. Aborting the phone's request does not refund anything.
- The broker's existing conservative charging rule applies unchanged: a reservation is charged at the worst case for an
  attempt that may have been billed, and settled only from the broker's own record. The phone never releases spending.
- A tool that is already running (for example a note being saved) completes; the loop stops before the next step.

## Owner-visible consequence

A stopped request can still count against the monthly spending cap. The Assistant shows "Stopped. No answer was added."
It does not promise a refund.
