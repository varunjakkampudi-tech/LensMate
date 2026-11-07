# Runbook: spend cap, live budget and provider outage

## Limits in force

- Monthly cap: INR 500 (50000 paise). Fixed in code (`MAX_MONTHLY_CAP_PAISE`, services/broker/src/config.ts). A higher
  configured value refuses to start, in every mode.
- Live-test budget: USD 0.50 (5000 paise at the approved INR 100 per USD accounting rate). Enforced by the development
  test bucket (`BROKER_DEV_TEST_CAP_PAISE`). It is separate from the monthly cap.
- Exchange rate: 10000 paise per USD (`BROKER_FX_PAISE_PER_USD`).
- Failed or timed-out calls are charged at their worst case, so a provider outage can use budget without a usable answer.

## Check spend

1. Broker ledger on the VPS (owner role, read only):
   `docker exec lensmate-broker-postgres-1 psql -U broker_owner -d broker -tAc "select month, spent_paise from broker_budget_month order by month desc limit 3"`
2. Provider usage: `GET https://openrouter.ai/api/v1/key` with the key (read only, no model call).
3. If the two disagree by more than the worst-case charge of one call, stop live mode and investigate before any further call.

## Stop spending immediately

1. Set `BROKER_MODE=mock` in `/opt/lensmate/src/.env.production` and run the deploy workflow for `dev` (or the deploy script).
   The broker then makes no provider call.
2. Record the reason in the deployment or incident record.

## Provider outage

- Calls fail after the timeout and are charged at worst case. The broker answers with an error, not a guess.
- Do not retry in a loop. Wait for the provider to recover, then check spend (above) before resuming.
- If the monthly cap is reached, the broker refuses new calls until the next month. Raising the cap is a reviewed code change.

## Before enabling live calls

Live mode needs all of: the owner's approval of the cloud-processing disclosure text; approval of the model list in
services/broker/src/pricing.ts; approval of the charging rule; `BROKER_PAID_CALLS` set on; `BROKER_OWNER_CAP_CONFIRMATION_PAISE`
equal to the monthly cap; and the database URL and provider key delivered as server-side secrets. Record each approval in
the release record with its date.
