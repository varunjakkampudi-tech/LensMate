# AI provider and data handling

## Trust boundaries

- The mobile app sends AI requests to the LensMate broker. Provider credentials are held by the broker and never bundled
  in the app.
- The broker validates the enrolled phone, checks the cloud disclosure and spend controls, applies the configured model
  allowlist, and sends provider privacy restrictions on each request. These rules are enforced in code and covered by
  broker tests.
- Personal notes and saved captures are kept in the phone's encrypted memory store. Only the note context selected for an
  explicit memory question is included in that request.
- Photo or video content is sent for AI processing only after an owner action. Glasses media transfer and encrypted phone
  storage are still under development; see the [device link specification](../hardware/glasses-spec.md).

## Operational controls

The exact model allowlist and cost reservations live in `services/broker/src/pricing.ts`; do not duplicate price snapshots
here because provider prices and zero-retention endpoints can change. The broker must fail closed when model, privacy,
budget, device authentication, or disclosure checks fail.

Before enabling paid provider calls, use the broker deployment and spend runbooks, review the live model's current privacy
terms and routing, verify the server-side key and budget configuration, and authorize the specific live test. Never add a
provider key to a mobile or web build.

The user-facing cloud disclosure is `STRINGS.cloudDisclosure` in `apps/mobile/src/strings.ts`. If its meaning changes,
update the approved disclosure version and its tests together.
