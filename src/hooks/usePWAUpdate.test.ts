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
  const originalLocation = window.location;
  let reloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });

    vi.stubGlobal("navigator", {
      serviceWorker: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.unstubAllGlobals();
    mockGetSWRegistration.mockReset();
  });

  it("returns needUpdate=true when a waiting service worker exists", async () => {
    const waiting = createMockWorker();
    const reg = createMockRegistration(waiting);
    mockGetSWRegistration.mockReturnValue(reg);

    const { result } = renderHook(() => usePWAUpdate());

    await waitFor(() => expect(result.current.needUpdate).toBe(true));
  });

  it("sends SKIP_WAITING and reloads via controllerchange", async () => {
    const waiting = createMockWorker();
    const reg = createMockRegistration(waiting);
    mockGetSWRegistration.mockReturnValue(reg);

    const { result } = renderHook(() => usePWAUpdate());
    await waitFor(() => expect(result.current.needUpdate).toBe(true));

    result.current.update();

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });

    const addEventListener = navigator.serviceWorker.addEventListener as ReturnType<typeof vi.fn>;
    const controllerChangeHandler = addEventListener.mock.calls.find(
      (call) => call[0] === "controllerchange",
    )?.[1] as (() => void) | undefined;

    expect(controllerChangeHandler).toBeDefined();
    controllerChangeHandler!();

    expect(reloadMock).toHaveBeenCalled();
  });

  it("falls back to reload after 3 seconds if controllerchange never fires", async () => {
    const waiting = createMockWorker();
    const reg = createMockRegistration(waiting);
    mockGetSWRegistration.mockReturnValue(reg);

    const { result } = renderHook(() => usePWAUpdate());
    await waitFor(() => expect(result.current.needUpdate).toBe(true));

    vi.useFakeTimers();
    result.current.update();
    vi.advanceTimersByTime(3000);

    expect(reloadMock).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not signal an update when no service worker is registered", () => {
    mockGetSWRegistration.mockReturnValue(undefined);

    const { result } = renderHook(() => usePWAUpdate());

    expect(result.current.needUpdate).toBe(false);
  });
});
