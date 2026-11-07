# 0003 — How the iPhone reaches the broker over HTTPS

Status: PROPOSED. Recommendation only. Nothing here is deployed, exposed or authorized. The owner chooses the option.

## Context

- The app accepts a plain `http://` broker address only for `localhost` and `127.0.0.1`
  (`apps/mobile/src/broker-config.ts`). A phone cannot reach the PC's localhost, and a LAN address such as
  `http://192.168.x.x` is refused. This is intended and stays.
- The broker (`services/broker`) serves plain HTTP. It has no TLS of its own. TLS must come from a reverse proxy in
  front of it or from a tunnel.
- Expo Go's network calls do not send an `Origin` header, so the broker's CORS allowlist does not apply to the phone.
  CORS only matters for the browser preview.
- Device requests are authenticated with a per-device credential (enrolment code, then bearer token). The broker
  refuses requests without a valid credential, and refuses revoked devices.

## Options

|                      | A. Public tunnel to the PC                                                | B. Trusted local HTTPS on the LAN                                                                                                        | C. Hosted broker                                       |
| -------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| What it is           | A tunnel service gives the PC's broker a public `https://` address        | A reverse proxy on the PC serves `https://<PC LAN IP>:8443` with a certificate from a local CA. The owner installs that CA on the iPhone | The broker is deployed on a hosting service with HTTPS |
| Cost                 | Free tier exists; needs an account                                        | No cost                                                                                                                                  | Hosting cost; deployment                               |
| Exposure             | The broker is reachable from the internet, protected only by its own auth | Reachable only on the home or office LAN                                                                                                 | Public                                                 |
| Owner setup          | Create an account, run the tunnel, paste the URL                          | Create a local CA, install its profile on the iPhone, enable full trust                                                                  | Deployment decisions                                   |
| Authorization needed | Yes: public exposure                                                      | Yes: installing a root certificate on the phone                                                                                          | Yes: deployment                                        |
| Risk                 | Highest: public endpoint, scanning, spend-cap abuse if credentials leak   | Low: LAN only; the CA key must stay on the PC                                                                                            | Medium to high: production operations                  |

## Recommendation

**Option B** for a temporary development test. It has no public exposure and no cost. Its risk is limited to protecting
the CA private key on the PC. Choose Option A only if B cannot work on your network, and only with explicit approval,
a short-lived tunnel, and the broker spend cap set low.

## Option B: exact design (for the owner to approve before anything is set up)

1. Generate a local CA and a server certificate whose subject alternative name is the PC's LAN IP.
2. Run a reverse proxy on the PC that terminates TLS on port 8443 and forwards to the broker on `127.0.0.1:8080`.
   The proxy must forward only broker routes, must not expose the admin CLI, and must set a request body limit above
   the broker's 1 MB image limit.
3. Install the CA certificate on the iPhone (AirDrop or email to yourself, then Settings → General → VPN & Device
   Management → install the profile), then Settings → General → About → Certificate Trust Settings → enable full trust.
4. Set `EXPO_PUBLIC_BROKER_BASE_URL=https://<PC LAN IP>:8443` in the development environment file.
5. Enrol the phone with a single-use code from the admin CLI, as before.

## Verification before the phone is used

- TLS: `openssl s_client -connect <PC LAN IP>:8443 -servername <PC LAN IP>` shows a chain to the local CA, with
  verification OK, and the certificate's SAN matches the IP.
- Authentication: a request without a credential returns 401. A request with a revoked credential returns 401.
- CORS: not relevant to the phone; check the browser preview separately.
- Network reachability: from the iPhone's Safari, `https://<PC LAN IP>:8443/` must answer, and must fail if the trust
  profile is not installed (fail-closed).
- Plain HTTP from the phone: the app refuses it (`broker-config.ts`). Confirm by setting an `http://` LAN address and
  seeing the "INSECURE" configuration error.
- Spend cap: unchanged. The mock mode stays the default; no billable call is made by these checks.

## Not decided here

- Whether any broker route should ever be public (Option A or C). Owner decision.
- Who keeps the CA key, and when the CA and certificate expire (owner decision; recommended: a one-week lifetime for a
  temporary test).
