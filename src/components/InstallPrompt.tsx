import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X, Share } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "kyf.installPrompt.dismissedAt";
const DISMISS_DAYS = 14;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOS = ua.includes("Mac") && "ontouchend" in document;
  return iOS || iPadOS;
}

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const t = Number(raw);
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari never fires beforeinstallprompt — show a manual hint instead.
    if (isIos() && !isStandalone()) {
      const t = window.setTimeout(() => {
        setShowIosHint(true);
        setVisible(true);
      }, 2000);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBip);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") {
        setVisible(false);
      } else {
        dismiss();
      }
    } catch {
      /* ignore */
    } finally {
      setDeferred(null);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border bg-background p-3 shadow-lg md:left-auto md:right-4 md:mx-0">
      <div className="flex-1 text-sm">
        {showIosHint ? (
          <span className="flex items-center gap-1">
            Install KYF: tap <Share className="inline h-4 w-4" /> then
            <span className="font-medium">Add to Home Screen</span>.
          </span>
        ) : (
          <span>
            <span className="font-medium">Install KYF</span> for offline access and a
            home-screen shortcut.
          </span>
        )}
      </div>
      {!showIosHint && deferred && (
        <Button size="sm" onClick={install}>
          <Download className="mr-1 h-4 w-4" />
          Install
        </Button>
      )}
      <Button size="icon" variant="ghost" onClick={dismiss} aria-label="Dismiss">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
