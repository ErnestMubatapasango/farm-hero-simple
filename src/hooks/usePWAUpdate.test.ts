import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePWAUpdate } from "./usePWAUpdate";
import { getSWRegistration } from "@/pwa/registerSW";

vi.mock("@/pwa/registerSW", () => ({
  getSWRegistration: vi.fn(),
}));

const mockGetSWRegistration = vi.mocked(getSWRegistration);

const createMockRegistration = (waiting: ServiceWorker | null): ServiceWorkerRegistration => {
  return {
    waiting,
    installing: null,
    active: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    update: vi.fn(),
    unregister: vi.fn(),
  } as unknown as ServiceWorkerRegistration;
};

const createMockWorker = (): ServiceWorker => {
  return {
    state: "installed",
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as ServiceWorker;
};

describe("usePWAUpdate", () => {
  const originalReload = window.location.reload;
  const controllerAddEventListener = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {
      serviceWorker: {
        addEventListener: controllerAddEventListener,
        removeEventListener: vi.fn(),
      },
    });
    vi.stubGlobal("window.location", { ...window.location, reload: vi.fn() });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    mockGetSWRegistration.mockReset();
    window.location.reload = originalReload;
  });

  it("returns needUpdate=true when a waiting service worker exists", async () => {
    const waiting = createMockWorker();
    const reg = createMockRegistration(waiting);
    mockGetSWRegistration.mockReturnValue(reg);

    const { result } = renderHook(() => usePWAUpdate());

    await waitFor(() => expect(result.current.needUpdate).toBe(true));
  });

  it("sends SKIP_WAITING and reloads when update is triggered", async () => {
    const waiting = createMockWorker();
    const reg = createMockRegistration(waiting);
    mockGetSWRegistration.mockReturnValue(reg);

    const { result } = renderHook(() => usePWAUpdate());
    await waitFor(() => expect(result.current.needUpdate).toBe(true));

    result.current.update();

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(controllerAddEventListener).toHaveBeenCalledWith(
      "controllerchange",
      expect.any(Function),
    );

    // Fallback reload should fire after 3 seconds.
    vi.advanceTimersByTime(3000);
    expect(window.location.reload).toHaveBeenCalled();
  });

  it("does not signal an update when no service worker is registered", async () => {
    mockGetSWRegistration.mockReturnValue(undefined);

    const { result } = renderHook(() => usePWAUpdate());

    expect(result.current.needUpdate).toBe(false);
  });
});
