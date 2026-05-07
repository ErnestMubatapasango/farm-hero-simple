import { useState, useRef } from "react";
import { FileUp, Trash2, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DOC_TYPES = [
  { key: "national_id", label: "National ID / Passport" },
  { key: "land_title", label: "Land Title / Ownership Proof" },
  { key: "receipts", label: "Purchase Receipts" },
  { key: "insurance", label: "Insurance Documents" },
];

export default function DocumentsStep({ userId, uploadedDocs, setFormData }) {
  const [uploading, setUploading] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const fileRefs = useRef({});

  async function handleUpload(docType, file) {
    if (!file || !userId) return;

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("File too large. Maximum 10MB allowed.");
      return;
    }

    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Unsupported file type. Use PDF, JPG, PNG, or WebP.");
      return;
    }

    setUploading(docType);

    try {
      const ext = file.name.split(".").pop();
      const filePath = `${userId}/${docType}_${Date.now()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from("farmer-documents")
        .upload(filePath, file);

      if (storageError) throw storageError;

      const { data: docRecord, error: dbError } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          name: file.name,
          type: docType,
          file_path: filePath,
          status: "pending",
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setFormData((prev) => ({
        ...prev,
        uploadedDocs: {
          ...prev.uploadedDocs,
          [docType]: { id: docRecord.id, name: file.name, filePath },
        },
      }));

      toast.success(`${file.name} uploaded successfully`);
    } catch (err) {
      console.error(err);
      toast.error("Upload failed: " + (err.message || "Unknown error"));
    } finally {
      setUploading(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const doc = uploadedDocs[deleteTarget];

    try {
      if (doc?.filePath) {
        await supabase.storage.from("farmer-documents").remove([doc.filePath]);
      }
      if (doc?.id) {
        await supabase.from("documents").delete().eq("id", doc.id);
      }

      setFormData((prev) => {
        const updated = { ...prev.uploadedDocs };
        delete updated[deleteTarget];
        return { ...prev, uploadedDocs: updated };
      });

      toast.success("Document removed");
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove document");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-foreground">Document Uploads</h2>
      <p className="text-sm text-muted-foreground">
        Upload supporting documents. Accepted formats: PDF, JPG, PNG (max 10MB each).
      </p>
      <div className="space-y-4">
        {DOC_TYPES.map(({ key, label }) => {
          const uploaded = uploadedDocs[key];
          const isUploading = uploading === key;

          return (
            <div key={key}>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                ref={(el) => (fileRefs.current[key] = el)}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(key, file);
                  e.target.value = "";
                }}
              />

              {uploaded ? (
                <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{uploaded.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(key)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRefs.current[key]?.click()}
                  disabled={isUploading}
                  className="w-full rounded-lg border border-dashed border-border p-5 text-center hover:border-primary/40 transition-colors disabled:opacity-50"
                >
                  {isUploading ? (
                    <Loader2 className="h-6 w-6 text-muted-foreground mx-auto mb-2 animate-spin" />
                  ) : (
                    <FileUp className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  )}
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isUploading ? "Uploading..." : "Click to upload"}
                  </p>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the uploaded file. You can upload a new one after removal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
