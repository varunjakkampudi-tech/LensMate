import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

/**
 * Runs the real public/sw.js in a sandbox and checks which requests it may cache. Sensitive requests must never reach
 * the cache: broker and AI calls, captures, credentials, anything with a query string or an Authorization header.
 */
const ORIGIN = "https://lensmate.test";
const source = readFileSync(join(__dirname, "../../public/sw.js"), "utf8");
const sandbox: Record<string, unknown> = {
  self: {
    location: { origin: ORIGIN },
    addEventListener: () => undefined,
    clients: { claim: () => Promise.resolve() },
    skipWaiting: () => undefined,
  },
  caches: {
    open: () => Promise.resolve({}),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
  },
};
runInNewContext(source, sandbox);
const policy = (sandbox.self as { __lensmatePolicy: PolicyApi }).__lensmatePolicy;

interface PolicyApi {
  shouldCache(request: FakeRequest, url: URL): boolean;
  isStaticAsset(url: URL): boolean;
  CACHE: string;
  SHELL: string[];
}

interface FakeRequest {
  method: string;
  mode: string;
  headers: { get(name: string): string | null };
}

function request(
  url: string,
  options: { method?: string; mode?: string; auth?: boolean } = {},
): [FakeRequest, URL] {
  const headers = options.auth === true ? { authorization: "Bearer x" } : {};
  return [
    {
      method: options.method ?? "GET",
      mode: options.mode ?? "cors",
      headers: {
        get: (name: string) => (headers as Record<string, string>)[name.toLowerCase()] ?? null,
      },
    },
    new URL(url, ORIGIN),
  ];
}

const allowed = (url: string, options?: Parameters<typeof request>[1]) => {
  const [req, parsed] = request(url, options);
  return policy.shouldCache(req, parsed);
};

describe("service worker cache policy", () => {
  it("caches the static bundle, icons and manifest", () => {
    expect(allowed("/_expo/static/js/web/entry-abc.js")).toBe(true);
    expect(allowed("/icons/icon-192.png")).toBe(true);
    expect(allowed("/manifest.json")).toBe(true);
  });

  it("caches the app shell only for the start page navigation", () => {
    expect(allowed("/", { mode: "navigate" })).toBe(true);
    expect(allowed("/memory", { mode: "navigate" })).toBe(false);
    expect(allowed("/capture", { mode: "navigate" })).toBe(false);
  });

  it("never caches the broker, AI or backup calls", () => {
    expect(allowed("/v1/ai/vision", { method: "POST" })).toBe(false);
    expect(allowed("/v1/ai/text")).toBe(false);
    expect(allowed("/v1/backup")).toBe(false);
    expect(allowed("/v1/usage")).toBe(false);
  });

  it("never caches requests with a query string, credentials or another origin", () => {
    expect(allowed("/_expo/static/js/web/entry-abc.js?token=1")).toBe(false);
    expect(allowed("/icons/icon-192.png", { auth: true })).toBe(false);
    expect(allowed("https://example.com/icons/icon-192.png")).toBe(false);
  });

  it("never caches writes", () => {
    expect(allowed("/_expo/static/js/web/entry-abc.js", { method: "PUT" })).toBe(false);
  });

  it("never treats personal pages as static assets", () => {
    const [, parsed] = request("/memory");
    expect(policy.isStaticAsset(parsed)).toBe(false);
  });

  it("names a versioned cache and a shell that contains no user data", () => {
    expect(policy.CACHE).toBe("lensmate-static-v1");
    expect(policy.SHELL).toEqual(
      expect.arrayContaining(["/", "/manifest.json", "/icons/apple-touch-icon.png"]),
    );
    expect(policy.SHELL.some((path) => path.startsWith("/v1/"))).toBe(false);
  });
});
