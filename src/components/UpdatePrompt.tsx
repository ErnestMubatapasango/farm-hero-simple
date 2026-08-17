import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpCircle, X } from "lucide-react";
import { usePWAUpdate } from "@/hooks/usePWAUpdate";
import { APP_VERSION } from "@/lib/version";

const DISMISSED_KEY = "kyf.updatePrompt.dismissed";

interface DismissedState {
  version: string;
  at: number;
}

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const parsed: DismissedState = JSON.parse(raw);
    if (parsed.version !== APP_VERSION) return false;
    // Keep dismissed for 24 hours, then resurface on the next update.
    return Date.now() - parsed.at < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function setDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify({ version: APP_VERSION, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function UpdatePrompt() {
  const { needUpdate, update } = usePWAUpdate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (needUpdate && !isDismissed()) {
      setVisible(true);
    }
  }, [needUpdate]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border bg-background p-3 shadow-lg md:bottom-4 md:left-auto md:right-4 md:mx-0">
      <ArrowUpCircle className="h-5 w-5 shrink-0 text-primary" />
      <div className="flex-1 text-sm">
        <p className="font-medium">A new version of KYF is available</p>
        <p className="text-xs text-muted-foreground">
          Update now to get the latest fixes and improvements.
        </p>
      </div>
      <Button
        size="sm"
        onClick={() => {
          setVisible(false);
          update();
        }}
      >
        Update
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => {
          setDismissed();
          setVisible(false);
        }}
        aria-label="Dismiss update prompt"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
