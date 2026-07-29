import { useEffect, useState } from "react";
import { syncManager, type SyncState } from "@/lib/offline/syncManager";

export function useSyncStatus(): SyncState & {
  syncNow: () => Promise<void>;
  retryAll: () => Promise<void>;
  discardFailed: (id: string) => Promise<void>;
} {
  const [state, setState] = useState<SyncState>(syncManager.getState());
  useEffect(() => {
    const unsub = syncManager.subscribe(setState);
    return () => {
      unsub();
    };
  }, []);
  return {
    ...state,
    syncNow: () => syncManager.sync(true),
    retryAll: () => syncManager.retryAll(),
    discardFailed: (id: string) => syncManager.discardFailed(id),
  };
}
