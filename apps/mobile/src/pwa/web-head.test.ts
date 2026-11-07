import { ensureWebAppHead, type HeadDocument } from "./web-head";

/** A minimal document: enough for the head helper, nothing else. */
function fakeDocument(initial: { viewport?: string; tags?: string[] } = {}) {
  const elements: { tag: string; attrs: Record<string, string> }[] = [];
  const present = new Set(initial.tags ?? []);
  const viewport = initial.viewport === undefined ? null : { attrs: { content: initial.viewport } };
  const doc: HeadDocument & { elements: typeof elements } = {
    elements,
    querySelector(selector: string) {
      if (selector === 'meta[name="viewport"]') {
        return viewport === null
          ? null
          : {
              get content() {
                return viewport.attrs.content;
              },
              setAttribute: (name: string, value: string) => {
                if (name === "content") {
                  viewport.attrs.content = value;
                }
              },
            };
      }
      return present.has(selector) ? { setAttribute: () => undefined } : null;
    },
    createElement(tag: "link" | "meta") {
      const attrs: Record<string, string> = {};
      const el = {
        tag,
        attrs,
        setAttribute: (name: string, value: string) => (attrs[name] = value),
      };
      return el;
    },
    head: {
      appendChild(el: unknown) {
        const added = el as { tag: string; attrs: Record<string, string> };
        elements.push(added);
        // Remember the tag the way a real query would find it, so a second call sees it.
        const key = added.tag === "link" ? "rel" : "name";
        present.add(`${added.tag}[${key}="${added.attrs[key]}"]`);
        return el;
      },
    },
  };
  return doc;
}

describe("iPhone Home Screen head tags", () => {
  it("adds the manifest, Apple icon and web-app tags once", () => {
    const doc = fakeDocument({ viewport: "width=device-width, initial-scale=1" });

    const added = ensureWebAppHead(doc);

    expect(added).toBeGreaterThanOrEqual(6);
    const attrs = doc.elements.map((e) => e.attrs);
    expect(attrs).toContainEqual(
      expect.objectContaining({ rel: "manifest", href: "/manifest.json" }),
    );
    expect(attrs).toContainEqual(
      expect.objectContaining({ rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" }),
    );
    expect(attrs).toContainEqual(
      expect.objectContaining({ name: "apple-mobile-web-app-capable", content: "yes" }),
    );
  });

  it("adds nothing on a second call", () => {
    const doc = fakeDocument({
      viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
    });
    ensureWebAppHead(doc);
    const count = doc.elements.length;

    expect(ensureWebAppHead(doc)).toBe(0);
    expect(doc.elements.length).toBe(count);
  });

  it("keeps a tag that is already present", () => {
    const doc = fakeDocument({ viewport: "width=device-width", tags: ['link[rel="manifest"]'] });

    ensureWebAppHead(doc);

    expect(doc.elements.some((e) => e.attrs.rel === "manifest")).toBe(false);
  });

  it("turns on viewport-fit=cover so the safe-area padding applies", () => {
    const doc = fakeDocument({ viewport: "width=device-width, initial-scale=1" });

    ensureWebAppHead(doc);

    expect(doc.querySelector('meta[name="viewport"]')?.content).toBe(
      "width=device-width, initial-scale=1, viewport-fit=cover",
    );
  });
});
