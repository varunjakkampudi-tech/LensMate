import { ProtocolCodec, loadBundledProtocolRoot } from "@lensmate/protocol";
import { VirtualGlasses } from "@lensmate/simulator";

/** The Stage A link: virtual glasses through the same GlassesLink interface the real link will use. */
export function createVirtualGlasses(): VirtualGlasses {
  return new VirtualGlasses(new ProtocolCodec(loadBundledProtocolRoot()));
}
