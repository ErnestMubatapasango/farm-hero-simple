// Guarded service worker registration. Only registers in the published app,
// never in dev/preview/iframes, and supports ?sw=off to disable.

let swRegistration: ServiceWorkerRegistration | undefined;
let resumeListenerAdded = false;

function shouldRegister(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return false;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return false;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return false;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return false;
  if (new URLSearchParams(window.location.search).has("sw")) {
    const v = new URLSearchParams(window.location.search).get("sw");
    if (v === "off") return false;
  }
  return true;
}

async function unregisterMatching() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = r.active?.scriptURL || "";
      if (url.endsWith("/sw.js")) {
        await r.unregister();
      }
    }
  } catch {
    /* ignore */
  }
}

export function getSWRegistration(): ServiceWorkerRegistration | undefined {
  return swRegistration;
}

export async function registerSW(): Promise<ServiceWorkerRegistration | undefined> {
  if (!shouldRegister()) {
    await unregisterMatching();
    return;
  }
  try {
    swRegistration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

    // Mobile browsers often only check for a new SW on startup. Poll on resume
    // so users see an update prompt soon after a deploy.
    if (!resumeListenerAdded) {
      resumeListenerAdded = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && swRegistration) {
          void swRegistration.update();
        }
      });
    }
  } catch (err) {
    console.warn("[pwa] SW registration failed", err);
  }
  return swRegistration;
}
