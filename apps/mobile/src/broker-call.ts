import { requestBrokerChat, type BrokerChatRequest, type BrokerReply } from "@lensmate/core";
import {
  isCloudDisclosureAccepted,
  resolveBrokerAccess,
  type BrokerAccessBlock,
} from "./broker-access";
import { readBrokerConfig, type BrokerConfig } from "./broker-config";
import {
  loadDeviceCredential,
  secureStorage,
  type CredentialState,
  type CredentialStorage,
} from "./device-credential";

/**
 * The owner-approved cloud-processing disclosure version. Null until the owner approves the text (owner decision (e) in
 * provider-privacy-and-models.md). While it is null, no call can be made from the app.
 */
export const APPROVED_CLOUD_DISCLOSURE_VERSION: string | null = null;

/** Thrown before any network request when a precondition for broker use is missing (BLOCKER-006). */
export class BrokerCallBlocked extends Error {
  constructor(readonly reason: BrokerAccessBlock) {
    super(reason);
    this.name = "BrokerCallBlocked";
  }
}

export interface BrokerCallPolicy {
  readonly config: BrokerConfig;
  readonly storage: CredentialStorage;
  /** Null means the disclosure is not approved, so every call is blocked. */
  readonly approvedDisclosureVersion: string | null;
  readonly doFetch?: typeof fetch;
}

/**
 * The only path from the app to the broker. It reads the address, the device credential and the disclosure acceptance
 * itself, and sends the request only when all three hold. A blocked call makes no request. The caller cannot supply
 * the approval or the acceptance.
 */
export async function callBrokerWithPolicy(
  policy: BrokerCallPolicy,
  request: BrokerChatRequest,
  signal: AbortSignal,
): Promise<BrokerReply> {
  let credential: CredentialState;
  try {
    credential = await loadDeviceCredential(policy.storage);
  } catch {
    throw new BrokerCallBlocked("STORAGE_UNAVAILABLE");
  }
  const accepted = await isCloudDisclosureAccepted(
    policy.approvedDisclosureVersion,
    policy.storage,
  );
  const access = resolveBrokerAccess({
    config: policy.config,
    credential,
    disclosureVersion: policy.approvedDisclosureVersion,
    disclosureAccepted: accepted,
  });
  if (!access.ok) {
    throw new BrokerCallBlocked(access.reason);
  }
  return requestBrokerChat(
    {
      baseUrl: access.baseUrl,
      token: access.token,
      ...(policy.doFetch === undefined ? {} : { fetch: policy.doFetch }),
    },
    request,
    signal,
  );
}

/** The app's entry point: the address from configuration, secure storage, and the approved disclosure constant. */
export function callBroker(request: BrokerChatRequest, signal: AbortSignal): Promise<BrokerReply> {
  return callBrokerWithPolicy(
    {
      config: readBrokerConfig(),
      storage: secureStorage,
      approvedDisclosureVersion: APPROVED_CLOUD_DISCLOSURE_VERSION,
    },
    request,
    signal,
  );
}
