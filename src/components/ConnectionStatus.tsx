import { useState } from "react";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export function ConnectionStatus() {
  const { online, syncing, pending, failed, lastSyncAt, issues, syncNow, retryAll, discardFailed } =
    useSyncStatus();
  const [open, setOpen] = useState(false);

  const totalQueued = pending + failed;

  let label: string;
  let Icon = Wifi;
  let tone = "text-muted-foreground";
  if (!online) {
    label = totalQueued ? `Offline · ${totalQueued} queued` : "Offline";
    Icon = WifiOff;
    tone = "text-yellow-600";
  } else if (syncing) {
    label = "Syncing…";
    Icon = Loader2;
    tone = "text-primary";
  } else if (failed > 0) {
    label = `${failed} sync issue${failed > 1 ? "s" : ""}`;
    Icon = AlertTriangle;
    tone = "text-destructive";
  } else if (pending > 0) {
    label = `${pending} pending`;
    Icon = RefreshCw;
    tone = "text-yellow-600";
  } else {
    label = "Online";
    Icon = Wifi;
    tone = "text-green-600";
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`hidden sm:flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md hover:bg-muted transition-colors ${tone}`}
          title="Connection & sync status"
        >
          <Icon className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">Sync status</div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            disabled={!online || syncing}
            onClick={() => syncNow()}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing ? "animate-spin" : ""}`} />
            Sync now
          </Button>
        </div>

        <div className="text-xs space-y-1 text-muted-foreground">
          <div className="flex items-center gap-2">
            {online ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-yellow-600" />
            )}
            <span>{online ? "Connected" : "No network — changes will sync when you're back online"}</span>
          </div>
          <div>Pending: <span className="text-foreground font-medium">{pending}</span></div>
          <div>Failed: <span className="text-foreground font-medium">{failed}</span></div>
          {lastSyncAt && (
            <div>Last sync: <span className="text-foreground">{new Date(lastSyncAt).toLocaleTimeString()}</span></div>
          )}
        </div>

        {failed > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-foreground">Sync issues</div>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => retryAll()}>
                Retry all
              </Button>
            </div>
            <ul className="space-y-2 max-h-52 overflow-y-auto">
              {issues.map((i) => (
                <li key={i.id} className="rounded-md border border-border p-2">
                  <div className="text-xs font-medium text-foreground capitalize">
                    {i.kind.replace("_", " ")}
                  </div>
                  <p className="text-xs text-destructive mt-0.5 break-words">{i.error}</p>
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-destructive mt-1"
                    onClick={() => discardFailed(i.id)}
                  >
                    Discard
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
