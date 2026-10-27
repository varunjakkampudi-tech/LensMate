import { canRegisterServiceWorker, registerAppShell, SW_PATH, type WebEnv } from "./service-worker";

type Listener = () => void;

/** A stand-in for a service-worker worker that records its statechange listeners so a test can fire them. */
function fakeWorker(state: string) {
  const listeners: Listener[] = [];
  return {
    state,
    postMessage: jest.fn(),
    addEventListener: (_type: string, fn: Listener) => listeners.push(fn),
    fire: () => listeners.forEach((fn) => fn()),
  };
}

/** A stand-in for a registration. `fireUpdateFound` simulates the browser noticing a new version. */
function fakeRegistration(options: { waiting: boolean }) {
  const updateFound: Listener[] = [];
  const registration = {
    waiting: options.waiting ? fakeWorker("installed") : null,
    installing: null as ReturnType<typeof fakeWorker> | null,
    addEventListener: (_type: string, fn: Listener) => updateFound.push(fn),
    fireUpdateFound: () => updateFound.forEach((fn) => fn()),
  };
  return registration;
}

function fakeContainer(options: { controlled: boolean; waiting: boolean }) {
  const registration = fakeRegistration(options);
  const container = {
    controller: options.controlled ? {} : null,
    register: jest.fn(async () => registration),
  };
  return { container, registration };
}

const env = (container: unknown, overrides: Partial<WebEnv> = {}): WebEnv => ({
  secure: true,
  production: true,
  ...overrides,
  serviceWorker: container as WebEnv["serviceWorker"],
});

describe("service worker registration", () => {
  it("registers only on a secure production web build", () => {
    const { container } = fakeContainer({ controlled: false, waiting: false });

    expect(canRegisterServiceWorker(env(container))).toBe(true);
    expect(canRegisterServiceWorker(env(container, { secure: false }))).toBe(false);
    expect(canRegisterServiceWorker(env(container, { production: false }))).toBe(false);
    expect(canRegisterServiceWorker(env(undefined))).toBe(false);
  });

  it("does nothing on a plain-HTTP LAN address or in development", async () => {
    const { container } = fakeContainer({ controlled: false, waiting: false });

    await expect(
      registerAppShell(env(container, { secure: false }), jest.fn()),
    ).resolves.toBeUndefined();
    await expect(
      registerAppShell(env(container, { production: false }), jest.fn()),
    ).resolves.toBeUndefined();
    expect(container.register).not.toHaveBeenCalled();
  });

  it("registers the worker at the site root", async () => {
    const { container } = fakeContainer({ controlled: false, waiting: false });

    await registerAppShell(env(container), jest.fn());

    expect(container.register).toHaveBeenCalledWith(SW_PATH, { scope: "/" });
  });

  it("reports a waiting update only once a page is already controlled", async () => {
    const onUpdate = jest.fn();
    const firstVisit = fakeContainer({ controlled: false, waiting: true });
    await registerAppShell(env(firstVisit.container), onUpdate);
    expect(onUpdate).not.toHaveBeenCalled();

    const returning = fakeContainer({ controlled: true, waiting: true });
    await registerAppShell(env(returning.container), onUpdate);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("reports an update that finishes installing while the app is open", async () => {
    const onUpdate = jest.fn();
    const { container, registration } = fakeContainer({ controlled: true, waiting: false });
    await registerAppShell(env(container), onUpdate);
    expect(onUpdate).not.toHaveBeenCalled();

    const installing = fakeWorker("installing");
    registration.installing = installing;
    registration.fireUpdateFound();
    installing.state = "installed";
    installing.fire();

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not report an update on a first visit, when nothing is controlled yet", async () => {
    const onUpdate = jest.fn();
    const { container, registration } = fakeContainer({ controlled: false, waiting: false });
    await registerAppShell(env(container), onUpdate);

    const installing = fakeWorker("installing");
    registration.installing = installing;
    registration.fireUpdateFound();
    installing.state = "installed";
    installing.fire();

    expect(onUpdate).not.toHaveBeenCalled();
  });
});
