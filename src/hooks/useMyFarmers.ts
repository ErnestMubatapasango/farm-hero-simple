import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getMyFarmers, refreshMyFarmersFromServer } from "@/lib/offline/farmerRepo";
import type { FarmerLocal } from "@/lib/offline/types";
import { syncManager } from "@/lib/offline/syncManager";

export function useMyFarmers() {
  const { session } = useAuth();
  const uid = session?.user?.id;
  const [farmers, setFarmers] = useState<FarmerLocal[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!uid) return;
    const rows = await getMyFarmers(uid);
    setFarmers(rows);
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    void (async () => {
      await reload();
      await refreshMyFarmersFromServer(uid);
      await reload();
    })();
    const unsub = syncManager.subscribe(() => {
      void reload();
    });
    return () => {
      unsub();
    };
  }, [uid, reload]);

  return { farmers, loading, reload };
}
