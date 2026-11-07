/**
 * Installable-web-app support (Add to Home Screen). The service worker (public/sw.js) caches only the public app shell
 * and static bundle. It registers only on a secure (HTTPS or localhost) production web build; a plain-HTTP LAN address
 * such as a phone on the same Wi-Fi gets no service worker, which is a browser rule, not a LensMate choice.
 */

export const SW_PATH = "/sw.js";

/** The browser features this module needs, passed in so the logic can be tested without a browser. */
export interface WebEnv {
  readonly serviceWorker?: ServiceWorkerContainer;
  readonly secure: boolean;
  readonly production: boolean;
}

export function canRegisterServiceWorker(env: WebEnv): boolean {
  return env.serviceWorker !== undefined && env.secure && env.production;
}

/**
 * Registers the app-shell worker and reports when a new version is waiting. The new version is not activated until the
 * user asks for it, so an update never reloads the page in the middle of a capture or an answer.
 */
export async function registerAppShell(
  env: WebEnv,
  onUpdateReady: () => void,
): Promise<ServiceWorkerRegistration | undefined> {
  const container = env.serviceWorker;
  if (container === undefined || !canRegisterServiceWorker(env)) {
    return undefined;
  }
  const registration = await container.register(SW_PATH, { scope: "/" });
  if (registration.waiting !== null && container.controller !== null) {
    onUpdateReady();
  }
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed" && container.controller !== null) {
        onUpdateReady();
      }
    });
  });
  return registration;
}

/** Activates the waiting version, then reloads once it has taken control. */
export function applyUpdate(registration: ServiceWorkerRegistration, reload: () => void): void {
  const waiting = registration.waiting;
  if (waiting === null) {
    reload();
    return;
  }
  navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
  waiting.postMessage("SKIP_WAITING");
}

/** The browser features of the running page. Native builds have none, so nothing registers there. */
export function browserEnv(): WebEnv {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    serviceWorker: nav?.serviceWorker,
    secure: typeof isSecureContext !== "undefined" && isSecureContext,
    production: process.env.NODE_ENV === "production",
  };
}
