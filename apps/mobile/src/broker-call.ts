import {
  requestBrokerChat,
  requestBrokerUsage,
  requestBrokerVision,
  type BrokerChatRequest,
  type BrokerClientOptions,
  type BrokerReply,
  type BrokerUsage,
  type BrokerVisionRequest,
} from "@lensmate/core";
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
 * The owner-approved cloud-processing disclosure version (owner decision (e), approved in chat on 2026-10-24 for the
 * preview with real AI under the INR 500 cap). The text is STRINGS.cloudDisclosure. Changing the text needs a new version.
 */
export const APPROVED_CLOUD_DISCLOSURE_VERSION: string | null = "2026-10-24.1";

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
/** Resolves broker access for one call, or throws BrokerCallBlocked before any request is made. */
async function brokerOptions(policy: BrokerCallPolicy): Promise<BrokerClientOptions> {
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
  return {
    baseUrl: access.baseUrl,
    token: access.token,
    ...(policy.doFetch === undefined ? {} : { fetch: policy.doFetch }),
  };
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
  return requestBrokerChat(await brokerOptions(policy), request, signal);
}

function appPolicy(): BrokerCallPolicy {
  return {
    config: readBrokerConfig(),
    storage: secureStorage,
    approvedDisclosureVersion: APPROVED_CLOUD_DISCLOSURE_VERSION,
  };
}

/** One user-captured image to the vision route, under the same access policy as text. */
export async function callBrokerVision(
  request: BrokerVisionRequest,
  signal: AbortSignal,
): Promise<BrokerReply> {
  return requestBrokerVision(await brokerOptions(appPolicy()), request, signal);
}

/** This month's server-side spend, for display only. */
export async function fetchBrokerUsage(signal: AbortSignal): Promise<BrokerUsage> {
  return requestBrokerUsage(await brokerOptions(appPolicy()), signal);
}

/** The app's entry point: the address from configuration, secure storage, and the approved disclosure constant. */
export function callBroker(request: BrokerChatRequest, signal: AbortSignal): Promise<BrokerReply> {
  return callBrokerWithPolicy(appPolicy(), request, signal);
}
