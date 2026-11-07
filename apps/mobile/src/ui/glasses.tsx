import { createContext, useContext, type ReactNode } from "react";
import { useVirtualGlasses, type VirtualGlassesState } from "../use-virtual-glasses";

/** One glasses link for the whole app, so the header pill, Home and the simulator agree. */
const Ctx = createContext<VirtualGlassesState | null>(null);

export function GlassesProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useVirtualGlasses()}>{children}</Ctx.Provider>;
}

/** Falls back to a local link when rendered without the provider (unit tests). */
export function useGlasses(): VirtualGlassesState {
  const local = useVirtualGlasses();
  return useContext(Ctx) ?? local;
}
