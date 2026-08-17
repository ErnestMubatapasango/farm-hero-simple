import { useCallback, useEffect, useState } from "react";
import { getSWRegistration } from "@/pwa/registerSW";

interface UsePWAUpdateResult {
  /** True when a new service worker is waiting to take control. */
  needUpdate: boolean;
  /** Triggers the new service worker and reloads the page. */
  update: () => void;
}

export function usePWAUpdate(): UsePWAUpdateResult {
  const [needUpdate, setNeedUpdate] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | undefined>();

  useEffect(() => {
    const reg = getSWRegistration();
    if (!reg) return;

    setRegistration(reg);

    let currentInstalling: ServiceWorker | null = reg.installing;

    const markNeedUpdate = () => {
      setNeedUpdate(true);
    };

    const createStateChangeHandler = (worker: ServiceWorker) => () => {
      // Once the new worker is installed or activated, the app is stale until
      // the page reloads and the new controller takes over.
      if (worker.state === "installed" || worker.state === "activated") {
        markNeedUpdate();
      }
    };

    const attachInstallingListeners = (worker: ServiceWorker) => {
      const handler = createStateChangeHandler(worker);
      worker.addEventListener("statechange", handler);
      handler(); // initial check
      return handler;
    };

    let installingHandler: ReturnType<typeof attachInstallingListeners> | null = null;
    if (currentInstalling) {
      installingHandler = attachInstallingListeners(currentInstalling);
    }

    if (reg.waiting) {
      markNeedUpdate();
    }

    const onUpdateFound = () => {
      if (currentInstalling && installingHandler) {
        currentInstalling.removeEventListener("statechange", installingHandler);
      }
      currentInstalling = reg.installing;
      if (currentInstalling) {
        installingHandler = attachInstallingListeners(currentInstalling);
      }
    };

    reg.addEventListener("updatefound", onUpdateFound);

    return () => {
      reg.removeEventListener("updatefound", onUpdateFound);
      if (currentInstalling && installingHandler) {
        currentInstalling.removeEventListener("statechange", installingHandler);
      }
    };
  }, []);

  const update = useCallback(() => {
    // If the new worker is waiting, tell it to skip waiting. With Workbox
    // skipWaiting enabled this is usually a no-op, but it covers the case where
    // an older worker was already waiting before the config change.
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Fallback: reload even if the controller change event does not fire.
    window.setTimeout(() => {
      if (!reloaded) {
        window.location.reload();
      }
    }, 3000);
  }, [registration]);

  return { needUpdate, update };
}
