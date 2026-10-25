import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { BrokerConfig } from "./broker-config";
import {
  DEVICE_CREDENTIAL_KEY,
  saveDeviceCredential,
  type CredentialStorage,
} from "./device-credential";
import { EnrolmentScreen, normaliseCode } from "./enrolment-screen";
import { STRINGS } from "./strings";

const T = STRINGS.enrolment;

// Loads the React Native components and the global Response the tests use at file load, not inside a test.
void [Pressable, ScrollView, Text, TextInput, View, Response];

const CONFIG: BrokerConfig = { ok: true, baseUrl: "https://broker.example" };
const DEVICE_ID = "11111111-2222-4333-8444-555555555555";
const SECRET = "not-a-real-device-secret-".repeat(3);

interface MemoryStorage extends CredentialStorage {
  readonly values: Map<string, string>;
  dropWrites: boolean;
  failWrites: boolean;
}

function memoryStorage(): MemoryStorage {
  const storage: MemoryStorage = {
    values: new Map<string, string>(),
    dropWrites: false,
    failWrites: false,
    getItemAsync: (key) => Promise.resolve(storage.values.get(key) ?? null),
    setItemAsync: (key, value) => {
      if (storage.failWrites) {
        return Promise.reject(new Error("platform detail"));
      }
      if (!storage.dropWrites) {
        storage.values.set(key, value);
      }
      return Promise.resolve();
    },
    deleteItemAsync: (key) => {
      storage.values.delete(key);
      return Promise.resolve();
    },
  };
  return storage;
}

function brokerReplies(status: number, body: unknown) {
  return jest.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
}

async function typeCode(value: string) {
  await fireEvent.changeText(screen.getByLabelText(T.codeLabel), value);
}

async function typeLabel(value: string) {
  await fireEvent.changeText(screen.getByLabelText(T.labelLabel), value);
}

async function submit() {
  await fireEvent.press(screen.getByRole("button", { name: T.submit }));
}

describe("normaliseCode", () => {
  it("accepts the grouped or compact code in any case, and rejects anything else", async () => {
    expect(normaliseCode("abcd-efgh-jkmn-pqrs")).toBe("ABCDEFGHJKMNPQRS");
    expect(normaliseCode(" ABCD EFGH JKMN PQRS ")).toBe("ABCDEFGHJKMNPQRS");
    expect(normaliseCode("ABCD-EFGH-JKMN-PQR")).toBeNull();
    // I, L, O, U, 0 and 1 are not in the broker's alphabet.
    expect(normaliseCode("ABCD-EFGH-JKMN-PQRI")).toBeNull();
    expect(normaliseCode("")).toBeNull();
  });
});

describe("EnrolmentScreen", () => {
  it("explains that enrolment is unavailable when the broker address is not configured", async () => {
    await render(
      <EnrolmentScreen config={{ ok: false, reason: "NOT_CONFIGURED" }} onClose={jest.fn()} />,
    );
    expect(screen.getByText(T.notConfigured)).toBeTruthy();
    expect(screen.queryByRole("button", { name: T.submit })).toBeNull();
  });

  it("enrols with the normalised code and shows the device id, never the secret", async () => {
    const storage = memoryStorage();
    const broker = brokerReplies(200, { deviceId: DEVICE_ID, deviceSecret: SECRET });
    const { toJSON } = await render(
      <EnrolmentScreen
        config={CONFIG}
        onClose={jest.fn()}
        storage={storage}
        doFetch={broker as unknown as typeof fetch}
      />,
    );
    await typeCode("abcd-efgh-jkmn-pqrs");
    await typeLabel("Owner phone");
    await submit();

    expect(await screen.findByText(T.enrolled.replace("{id}", DEVICE_ID))).toBeTruthy();
    expect(broker).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(broker.mock.calls[0]?.[1]?.body)) as {
      code: string;
      label: string;
    };
    expect(sent).toEqual({ code: "ABCDEFGHJKMNPQRS", label: "Owner phone" });
    expect(JSON.stringify(toJSON())).not.toContain(SECRET);
    expect(storage.values.has(DEVICE_CREDENTIAL_KEY)).toBe(true);
    // The typed code is cleared after the attempt, so it does not stay on screen.
    expect(screen.getByLabelText(T.codeLabel).props.value).toBe("");
  });

  it("blocks a malformed code and a malformed label before any request", async () => {
    const broker = brokerReplies(200, { deviceId: DEVICE_ID, deviceSecret: SECRET });
    await render(
      <EnrolmentScreen
        config={CONFIG}
        onClose={jest.fn()}
        storage={memoryStorage()}
        doFetch={broker as unknown as typeof fetch}
      />,
    );
    await typeCode("TOO-SHORT");
    await typeLabel("phone");
    await submit();
    expect(screen.getByText(T.codeFormat)).toBeTruthy();

    await typeCode("ABCD-EFGH-JKMN-PQRS");
    await typeLabel("bad<label>");
    await submit();
    expect(screen.getByText(T.labelFormat)).toBeTruthy();
    expect(broker).not.toHaveBeenCalled();
  });

  it("shows a safe message for a refused code and clears the code field", async () => {
    const broker = brokerReplies(403, { code: "ENROLMENT_REFUSED" });
    await render(
      <EnrolmentScreen
        config={CONFIG}
        onClose={jest.fn()}
        storage={memoryStorage()}
        doFetch={broker as unknown as typeof fetch}
      />,
    );
    await typeCode("ABCD-EFGH-JKMN-PQRS");
    await typeLabel("phone");
    await submit();
    expect(await screen.findByText(T.errors.REFUSED)).toBeTruthy();
    expect(screen.getByLabelText(T.codeLabel).props.value).toBe("");
  });

  it("sends one request when the button is pressed twice", async () => {
    const broker = brokerReplies(200, { deviceId: DEVICE_ID, deviceSecret: SECRET });
    await render(
      <EnrolmentScreen
        config={CONFIG}
        onClose={jest.fn()}
        storage={memoryStorage()}
        doFetch={broker as unknown as typeof fetch}
      />,
    );
    await typeCode("ABCD-EFGH-JKMN-PQRS");
    await typeLabel("phone");
    await submit();
    await submit();
    await screen.findByText(T.enrolled.replace("{id}", DEVICE_ID));
    expect(broker).toHaveBeenCalledTimes(1);
  });

  it("tells the owner which device to revoke when the phone is registered but the credential is not stored", async () => {
    const storage = memoryStorage();
    storage.dropWrites = true;
    const broker = brokerReplies(200, { deviceId: DEVICE_ID, deviceSecret: SECRET });
    const { toJSON } = await render(
      <EnrolmentScreen
        config={CONFIG}
        onClose={jest.fn()}
        storage={storage}
        doFetch={broker as unknown as typeof fetch}
      />,
    );
    await typeCode("ABCD-EFGH-JKMN-PQRS");
    await typeLabel("phone");
    await submit();
    expect(
      await screen.findByText(T.errors.REGISTERED_BUT_NOT_STORED.split("{id}").join(DEVICE_ID)),
    ).toBeTruthy();
    expect(JSON.stringify(toJSON())).not.toContain(SECRET);
  });

  it("reports a write that keeps failing after the server accepted the code", async () => {
    const storage = memoryStorage();
    storage.failWrites = true;
    const broker = brokerReplies(200, { deviceId: DEVICE_ID, deviceSecret: SECRET });
    await render(
      <EnrolmentScreen
        config={CONFIG}
        onClose={jest.fn()}
        storage={storage}
        doFetch={broker as unknown as typeof fetch}
      />,
    );
    await typeCode("ABCD-EFGH-JKMN-PQRS");
    await typeLabel("phone");
    await submit();
    expect(
      await screen.findByText(T.errors.REGISTERED_BUT_NOT_STORED.split("{id}").join(DEVICE_ID)),
    ).toBeTruthy();
  });

  it("blocks enrolment when a credential is already stored, and names its device", async () => {
    const storage = memoryStorage();
    await saveDeviceCredential({ deviceId: DEVICE_ID, deviceSecret: SECRET }, storage);
    const { toJSON } = await render(
      <EnrolmentScreen
        config={CONFIG}
        onClose={jest.fn()}
        storage={storage}
        doFetch={brokerReplies(200, {}) as unknown as typeof fetch}
      />,
    );
    expect(await screen.findByText(T.alreadyEnrolled.replace("{id}", DEVICE_ID))).toBeTruthy();
    expect(screen.getByLabelText(T.codeLabel).props.editable).toBe(false);
    expect(JSON.stringify(toJSON())).not.toContain(SECRET);
  });

  it("removes a damaged credential only after a second, explicit tap", async () => {
    const storage = memoryStorage();
    storage.values.set(DEVICE_CREDENTIAL_KEY, "not json");
    await render(<EnrolmentScreen config={CONFIG} onClose={jest.fn()} storage={storage} />);
    expect(await screen.findByText(T.invalidCredential)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: T.removeInvalid }));
    expect(storage.values.has(DEVICE_CREDENTIAL_KEY)).toBe(true);

    await fireEvent.press(screen.getByRole("button", { name: T.removeConfirm }));
    expect(await screen.findByText(T.removed)).toBeTruthy();
    expect(storage.values.has(DEVICE_CREDENTIAL_KEY)).toBe(false);
  });

  it("lets the user remove a stored credential, after a second tap, so a revoked phone can enrol again", async () => {
    const storage = memoryStorage();
    storage.values.set(
      DEVICE_CREDENTIAL_KEY,
      JSON.stringify({ deviceId: DEVICE_ID, deviceSecret: SECRET }),
    );
    await render(<EnrolmentScreen config={CONFIG} onClose={jest.fn()} storage={storage} />);
    expect(await screen.findByText(T.alreadyEnrolled.replace("{id}", DEVICE_ID))).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: T.removeEnrolled }));
    expect(storage.values.has(DEVICE_CREDENTIAL_KEY)).toBe(true);

    await fireEvent.press(screen.getByRole("button", { name: T.removeConfirm }));
    expect(await screen.findByText(T.removed)).toBeTruthy();
    expect(storage.values.has(DEVICE_CREDENTIAL_KEY)).toBe(false);
  });

  it("calls back when closed", async () => {
    const onClose = jest.fn();
    await render(<EnrolmentScreen config={CONFIG} onClose={onClose} storage={memoryStorage()} />);
    await fireEvent.press(screen.getByRole("button", { name: T.back }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("waits for the stored-state check before enabling enrolment", async () => {
    const storage = memoryStorage();
    await render(<EnrolmentScreen config={CONFIG} onClose={jest.fn()} storage={storage} />);
    await waitFor(() => expect(screen.getByLabelText(T.codeLabel).props.editable).toBe(true));
  });
});

describe("EnrolmentScreen reinstall and storage read failures", () => {
  it("locks enrolment when the credential store cannot be read, so nothing is overwritten", async () => {
    const storage = memoryStorage();
    storage.getItemAsync = () => Promise.reject(new Error("platform detail"));
    await render(<EnrolmentScreen config={CONFIG} onClose={jest.fn()} storage={storage} />);
    expect(await screen.findByText(T.errors.READ_FAILED)).toBeTruthy();
    expect(screen.getByLabelText(T.codeLabel).props.editable).toBe(false);
    expect(screen.getByRole("button", { name: T.submit }).props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it("shows the reinstall guidance on a fresh install with no stored credential", async () => {
    await render(<EnrolmentScreen config={CONFIG} onClose={jest.fn()} storage={memoryStorage()} />);
    expect(screen.getByText(T.reinstallNote)).toBeTruthy();
    expect(screen.getByLabelText(T.codeLabel).props.editable).toBe(true);
  });
});
