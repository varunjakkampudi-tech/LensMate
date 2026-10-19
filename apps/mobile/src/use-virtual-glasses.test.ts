import { act, renderHook } from "@testing-library/react-native";
import { useVirtualGlasses } from "./use-virtual-glasses";

describe("useVirtualGlasses", () => {
  it("starts disconnected with no error", async () => {
    const { result } = await renderHook(() => useVirtualGlasses());
    expect(result.current.status).toBe("disconnected");
    expect(result.current.error).toBeNull();
  });

  it("reports connected after connect and disconnected after disconnect", async () => {
    const { result } = await renderHook(() => useVirtualGlasses());
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.status).toBe("connected");
    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.status).toBe("disconnected");
  });
});
