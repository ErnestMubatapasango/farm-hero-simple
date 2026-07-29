import { openDB, type IDBPDatabase } from "idb";
import type { OutboxItem, FarmerLocal, DocumentBlob } from "./types";

const DB_NAME = "kyf-offline";
const DB_VERSION = 1;

interface Schema {
  outbox: { key: string; value: OutboxItem };
  farmers_local: { key: string; value: FarmerLocal };
  documents_local: { key: string; value: DocumentBlob };
  meta: { key: string; value: any };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function getDB() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB not available");
  }
  if (!dbPromise) {
    dbPromise = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("farmers_local")) {
          db.createObjectStore("farmers_local", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("documents_local")) {
          db.createObjectStore("documents_local", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
      },
    });
  }
  return dbPromise;
}

export async function putOutbox(item: OutboxItem) {
  const db = await getDB();
  await db.put("outbox", item);
}

export async function listOutbox(userId?: string): Promise<OutboxItem[]> {
  const db = await getDB();
  const all = await db.getAll("outbox");
  return (userId ? all.filter((i) => i.userId === userId) : all).sort(
    (a, b) => a.createdAt - b.createdAt
  );
}

export async function deleteOutbox(id: string) {
  const db = await getDB();
  await db.delete("outbox", id);
}

export async function updateOutbox(id: string, patch: Partial<OutboxItem>) {
  const db = await getDB();
  const cur = await db.get("outbox", id);
  if (!cur) return;
  await db.put("outbox", { ...cur, ...patch });
}

export async function putFarmerLocal(f: FarmerLocal) {
  const db = await getDB();
  await db.put("farmers_local", f);
}

export async function bulkPutFarmersLocal(list: FarmerLocal[]) {
  const db = await getDB();
  const tx = db.transaction("farmers_local", "readwrite");
  await Promise.all(list.map((f) => tx.store.put(f)));
  await tx.done;
}

export async function listFarmersLocal(userId: string): Promise<FarmerLocal[]> {
  const db = await getDB();
  const all = await db.getAll("farmers_local");
  return all
    .filter((f) => f.enrolled_by === userId)
    .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
}

export async function getFarmerLocal(id: string): Promise<FarmerLocal | undefined> {
  const db = await getDB();
  return db.get("farmers_local", id);
}

export async function renameFarmerLocalId(oldId: string, newId: string) {
  const db = await getDB();
  const cur = await db.get("farmers_local", oldId);
  if (!cur) return;
  const tx = db.transaction("farmers_local", "readwrite");
  await tx.store.delete(oldId);
  await tx.store.put({ ...cur, id: newId, pendingSync: false });
  await tx.done;
}

export async function putDocumentBlob(key: string, blob: Blob) {
  const db = await getDB();
  await db.put("documents_local", { key, blob });
}

export async function getDocumentBlob(key: string): Promise<Blob | undefined> {
  const db = await getDB();
  const r = await db.get("documents_local", key);
  return r?.blob;
}

export async function deleteDocumentBlob(key: string) {
  const db = await getDB();
  await db.delete("documents_local", key);
}

export async function setMeta(key: string, value: any) {
  const db = await getDB();
  await db.put("meta", value, key);
}

export async function getMeta<T = any>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get("meta", key) as Promise<T | undefined>;
}

export async function clearAll() {
  const db = await getDB();
  const tx = db.transaction(["outbox", "farmers_local", "documents_local", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("outbox").clear(),
    tx.objectStore("farmers_local").clear(),
    tx.objectStore("documents_local").clear(),
    tx.objectStore("meta").clear(),
  ]);
  await tx.done;
}
