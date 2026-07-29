import { supabase } from "@/integrations/supabase/client";
import {
  deleteOutbox,
  getDocumentBlob,
  deleteDocumentBlob,
  listOutbox,
  renameFarmerLocalId,
  updateOutbox,
  setMeta,
} from "./db";
import type {
  OutboxItem,
  SaveFarmerPayload,
  UploadDocumentPayload,
} from "./types";
import { refreshMyFarmersFromServer, isOnline } from "./farmerRepo";

type Listener = (state: SyncState) => void;

export interface SyncState {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSyncAt: number | null;
  issues: { id: string; kind: string; error: string }[];
}

class SyncManager {
  private userId: string | null = null;
  private listeners = new Set<Listener>();
  private state: SyncState = {
    online: isOnline(),
    syncing: false,
    pending: 0,
    failed: 0,
    lastSyncAt: null,
    issues: [],
  };
  private timer: number | null = null;
  private started = false;
  private syncingLock = false;

  start(userId: string) {
    if (this.started && this.userId === userId) return;
    this.stop();
    this.userId = userId;
    this.started = true;

    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    window.addEventListener("focus", this.onFocus);
    this.timer = window.setInterval(() => {
      this.sync().catch(() => {});
    }, 60_000);

    // Kick off initial reconciliation and outbox drain
    this.refreshStatus();
    void refreshMyFarmersFromServer(userId).then(() => this.refreshStatus());
    void this.sync();
  }

  stop() {
    if (!this.started) return;
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    window.removeEventListener("focus", this.onFocus);
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.started = false;
    this.userId = null;
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.state);
    return () => this.listeners.delete(l);
  }

  getState(): SyncState {
    return this.state;
  }

  private setState(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  private onOnline = () => {
    this.setState({ online: true });
    void this.sync();
  };
  private onOffline = () => {
    this.setState({ online: false });
  };
  private onFocus = () => {
    if (isOnline()) void this.sync();
  };

  async refreshStatus() {
    if (!this.userId) return;
    const items = await listOutbox(this.userId);
    const failed = items.filter((i) => i.status === "failed");
    this.setState({
      pending: items.length - failed.length,
      failed: failed.length,
      issues: failed.map((i) => ({
        id: i.id,
        kind: i.kind,
        error: i.lastError || "Unknown error",
      })),
    });
  }

  async sync(force = false) {
    if (!this.userId) return;
    if (this.syncingLock) return;
    if (!isOnline()) {
      this.setState({ online: false });
      return;
    }
    this.syncingLock = true;
    this.setState({ syncing: true, online: true });

    try {
      const items = await listOutbox(this.userId);
      for (const item of items) {
        if (item.status === "failed" && !force) continue;
        await this.processItem(item);
      }
      await setMeta("lastSyncAt", Date.now());
      this.setState({ lastSyncAt: Date.now() });
      // Reconcile local cache with server after draining
      if (this.userId) await refreshMyFarmersFromServer(this.userId);
    } finally {
      this.syncingLock = false;
      this.setState({ syncing: false });
      await this.refreshStatus();
    }
  }

  async retryAll() {
    if (!this.userId) return;
    const items = await listOutbox(this.userId);
    for (const i of items) {
      if (i.status === "failed") {
        await updateOutbox(i.id, { status: "pending", attempts: 0, lastError: undefined });
      }
    }
    await this.sync(true);
  }

  async discardFailed(id: string) {
    await deleteOutbox(id);
    await this.refreshStatus();
  }

  private async processItem(item: OutboxItem) {
    await updateOutbox(item.id, { status: "processing" });
    try {
      if (item.kind === "save_farmer") {
        await this.processSaveFarmer(item);
      } else if (item.kind === "upload_document") {
        await this.processUploadDocument(item);
      } else if (item.kind === "delete_document") {
        // not implemented in this phase
        await deleteOutbox(item.id);
        return;
      }
      await deleteOutbox(item.id);
    } catch (err: any) {
      const msg = err?.message || String(err);
      await updateOutbox(item.id, {
        status: "failed",
        attempts: item.attempts + 1,
        lastError: msg,
      });
    }
  }

  private async processSaveFarmer(item: OutboxItem) {
    const p = item.payload as SaveFarmerPayload;
    const isLocal = p.farmerId && p.farmerId.startsWith("local-");
    const serverFarmerId = isLocal ? null : p.farmerId;

    const { data, error } = await supabase.rpc("save_farmer", {
      _farmer_id: serverFarmerId,
      _payload: p.payload as any,
      _crops: p.crops as any,
      _yields: p.yields as any,
    });
    if (error || !data) throw error || new Error("save_farmer returned no id");

    const newId = data as unknown as string;

    if (isLocal && p.farmerId) {
      // Remap local id -> server id in local cache and dependent queued items
      await renameFarmerLocalId(p.farmerId, newId);
      const remaining = await listOutbox(item.userId);
      for (const other of remaining) {
        if (other.id === item.id) continue;
        if (other.kind === "upload_document") {
          const up = other.payload as UploadDocumentPayload;
          if (up.farmerId === p.farmerId) {
            await updateOutbox(other.id, {
              payload: { ...up, farmerId: newId },
            });
          }
        }
      }
    }
  }

  private async processUploadDocument(item: OutboxItem) {
    const p = item.payload as UploadDocumentPayload;
    if (p.farmerId.startsWith("local-")) {
      throw new Error("Farmer not yet synced — will retry after farmer is created");
    }
    const blob = await getDocumentBlob(p.blobKey);
    if (!blob) throw new Error("Local file blob missing");

    const ext = p.fileName.split(".").pop() || "bin";
    const path = `${p.organizationId}/${p.farmerId}/${p.localDocId}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("farmer-documents")
      .upload(path, blob, {
        contentType: p.mimeType || undefined,
        upsert: false,
      });
    if (upErr) throw upErr;

    const { error: insErr } = await supabase.from("farmer_documents").insert({
      id: p.localDocId,
      farmer_id: p.farmerId,
      organization_id: p.organizationId,
      uploaded_by: item.userId,
      document_type: p.documentType,
      file_path: path,
      file_name: p.fileName,
      mime_type: p.mimeType,
      file_size: p.fileSize,
      status: "pending",
    });
    if (insErr) {
      await supabase.storage.from("farmer-documents").remove([path]).catch(() => {});
      throw insErr;
    }

    await deleteDocumentBlob(p.blobKey);
  }
}

export const syncManager = new SyncManager();
