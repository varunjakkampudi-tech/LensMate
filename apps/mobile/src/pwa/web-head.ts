/**
 * Adds the Home Screen tags to the page head at runtime. The web export cannot add them itself in single-page mode, so
 * the app adds them once on load. Safari reads these when LensMate is added to the Home Screen; whether it honours tags
 * inserted after load is a device check (see the iPhone checklist), so this is not a claim that it does.
 *
 * Only public values go in the head: the manifest and icon paths. No secret, token or user data.
 */

interface HeadElement {
  setAttribute(name: string, value: string): void;
}

export interface HeadDocument {
  querySelector(selector: string): (HeadElement & { content?: string }) | null;
  createElement(tag: "link" | "meta"): HeadElement;
  head: { appendChild(el: HeadElement): unknown };
}

const TAGS: { selector: string; tag: "link" | "meta"; attrs: Record<string, string> }[] = [
  {
    selector: 'link[rel="manifest"]',
    tag: "link",
    attrs: { rel: "manifest", href: "/manifest.json" },
  },
  {
    selector: 'link[rel="apple-touch-icon"]',
    tag: "link",
    attrs: { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
  },
  {
    selector: 'meta[name="apple-mobile-web-app-capable"]',
    tag: "meta",
    attrs: { name: "apple-mobile-web-app-capable", content: "yes" },
  },
  {
    selector: 'meta[name="apple-mobile-web-app-title"]',
    tag: "meta",
    attrs: { name: "apple-mobile-web-app-title", content: "LensMate" },
  },
  {
    selector: 'meta[name="apple-mobile-web-app-status-bar-style"]',
    tag: "meta",
    attrs: { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
  },
];

/** Adds each missing tag once. Safe to call on every load. Returns how many tags it added. */
export function ensureWebAppHead(doc: HeadDocument): number {
  let added = 0;
  for (const { selector, tag, attrs } of TAGS) {
    if (doc.querySelector(selector) !== null) {
      continue;
    }
    const el = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      el.setAttribute(name, value);
    }
    doc.head.appendChild(el);
    added += 1;
  }
  // Let the page use the notch and home-indicator areas (env(safe-area-inset-*) in the shell).
  const viewport = doc.querySelector('meta[name="viewport"]');
  if (
    viewport !== null &&
    viewport.content !== undefined &&
    !viewport.content.includes("viewport-fit=cover")
  ) {
    viewport.setAttribute("content", `${viewport.content}, viewport-fit=cover`);
    added += 1;
  }
  return added;
}
