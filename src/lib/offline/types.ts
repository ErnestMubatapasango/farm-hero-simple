export type OutboxKind = "save_farmer" | "upload_document" | "delete_document";

export type OutboxStatus = "pending" | "processing" | "failed";

export interface SaveFarmerPayload {
  farmerId: string | null; // null for create, or local-* / server uuid for edit
  payload: Record<string, any>;
  crops: any[];
  yields: any[];
}

export interface UploadDocumentPayload {
  localDocId: string;
  farmerId: string; // may be a local-* id, resolved at sync time
  organizationId: string;
  documentType: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number;
  // blobKey points to documents_local store
  blobKey: string;
}

export interface DeleteDocumentPayload {
  documentId: string;
  filePath: string;
}

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  payload: SaveFarmerPayload | UploadDocumentPayload | DeleteDocumentPayload;
  createdAt: number;
  attempts: number;
  lastError?: string;
  status: OutboxStatus;
  userId: string;
}

export interface FarmerLocal {
  id: string; // server uuid OR local-<uuid>
  organization_id: string;
  enrolled_by: string;
  status: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  region?: string | null;
  district?: string | null;
  updated_at: string;
  pendingSync?: boolean;
  raw?: Record<string, any>;
}

export interface DocumentBlob {
  key: string;
  blob: Blob;
}
