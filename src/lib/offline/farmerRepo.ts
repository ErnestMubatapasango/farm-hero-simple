import { supabase } from "@/integrations/supabase/client";
import {
  bulkPutFarmersLocal,
  getFarmerLocal,
  listFarmersLocal,
  putDocumentBlob,
  putFarmerLocal,
  putOutbox,
} from "./db";
import type { FarmerLocal, SaveFarmerPayload, UploadDocumentPayload } from "./types";

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function localId() {
  return `local-${crypto.randomUUID()}`;
}

function outboxId() {
  return crypto.randomUUID();
}

export interface SaveFarmerArgs {
  farmerId: string | null;
  organizationId: string;
  userId: string;
  payload: Record<string, any>;
  crops: any[];
  yields: any[];
}

export interface SaveFarmerResult {
  farmerId: string;
  queued: boolean;
}

export async function saveFarmer(args: SaveFarmerArgs): Promise<SaveFarmerResult> {
  const { farmerId, organizationId, userId, payload, crops, yields } = args;

  if (isOnline()) {
    const { data, error } = await supabase.rpc("save_farmer", {
      _farmer_id: (farmerId ?? null) as any,
      _payload: payload as any,
      _crops: crops as any,
      _yields: yields as any,
    });
    if (error || !data) {
      const msg = (error?.message || "").toLowerCase();
      const looksNetwork = msg.includes("fetch") || msg.includes("network");
      if (!looksNetwork) throw error;
    } else {
      const id = data as unknown as string;
      await putFarmerLocal(toLocal(id, organizationId, userId, payload, false));
      return { farmerId: id, queued: false };
    }
  }

  // Offline queue path
  const id = farmerId ?? localId();
  const local = toLocal(id, organizationId, userId, payload, true);
  await putFarmerLocal(local);

  const item: SaveFarmerPayload = {
    farmerId,
    payload,
    crops,
    yields,
  };
  await putOutbox({
    id: outboxId(),
    kind: "save_farmer",
    payload: { ...item, farmerId: farmerId ?? id },
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
    userId,
  });

  return { farmerId: id, queued: true };
}

function toLocal(
  id: string,
  organization_id: string,
  enrolled_by: string,
  payload: Record<string, any>,
  pending: boolean
): FarmerLocal {
  return {
    id,
    organization_id,
    enrolled_by,
    status: payload.status || "draft",
    first_name: payload.first_name || "",
    last_name: payload.last_name || "",
    phone: payload.phone || null,
    region: payload.region || null,
    district: payload.district || null,
    updated_at: new Date().toISOString(),
    pendingSync: pending,
    raw: payload,
  };
}

export async function queueDocumentUpload(args: {
  farmerId: string;
  organizationId: string;
  userId: string;
  documentType: string;
  file: File;
}): Promise<{ queued: boolean }> {
  const localDocId = crypto.randomUUID();
  const blobKey = `doc-${localDocId}`;
  await putDocumentBlob(blobKey, args.file);
  const payload: UploadDocumentPayload = {
    localDocId,
    farmerId: args.farmerId,
    organizationId: args.organizationId,
    documentType: args.documentType,
    fileName: args.file.name,
    mimeType: args.file.type || null,
    fileSize: args.file.size,
    blobKey,
  };
  await putOutbox({
    id: outboxId(),
    kind: "upload_document",
    payload,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
    userId: args.userId,
  });
  return { queued: true };
}

export async function refreshMyFarmersFromServer(userId: string) {
  if (!isOnline()) return;
  const { data, error } = await supabase
    .from("farmers")
    .select("id, organization_id, enrolled_by, status, first_name, last_name, phone, region, district, updated_at")
    .eq("enrolled_by", userId)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error || !data) return;
  const rows: FarmerLocal[] = data.map((r: any) => ({
    id: r.id,
    organization_id: r.organization_id,
    enrolled_by: r.enrolled_by,
    status: r.status,
    first_name: r.first_name,
    last_name: r.last_name,
    phone: r.phone,
    region: r.region,
    district: r.district,
    updated_at: r.updated_at || new Date().toISOString(),
    pendingSync: false,
  }));
  await bulkPutFarmersLocal(rows);
}

export async function getMyFarmers(userId: string) {
  return listFarmersLocal(userId);
}

export async function getFarmerCached(id: string) {
  return getFarmerLocal(id);
}
