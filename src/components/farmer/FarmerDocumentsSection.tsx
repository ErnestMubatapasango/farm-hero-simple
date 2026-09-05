import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Upload,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DocumentPreviewDialog from "./DocumentPreviewDialog";
import RequiredDocumentsChecklist from "./RequiredDocumentsChecklist";
import { queueDocumentUpload } from "@/lib/offline/farmerRepo";
import { syncManager } from "@/lib/offline/syncManager";


interface FarmerDocument {
  id: string;
  farmer_id: string;
  organization_id: string;
  uploaded_by: string;
  document_type: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  status: string;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
}

const DOC_TYPES: { value: string; label: string }[] = [
  { value: "id", label: "National ID" },
  { value: "land_title", label: "Land Title" },
  { value: "receipt", label: "Receipt" },
  { value: "insurance", label: "Insurance" },
  { value: "photo", label: "Photo" },
  { value: "other", label: "Other" },
];

const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  farmerId: string;
  organizationId: string;
  canEdit: boolean;
  isAdmin: boolean;
}

export default function FarmerDocumentsSection({
  farmerId,
  organizationId,
  canEdit,
  isAdmin,
}: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [docs, setDocs] = useState<FarmerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<string>("id");
  const [previewDoc, setPreviewDoc] = useState<FarmerDocument | null>(null);


  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("farmer_documents")
      .select("*")
      .eq("farmer_id", farmerId)
      .order("created_at", { ascending: false });
    setDocs((data as FarmerDocument[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmerId]);

  const handleUpload = async (file: File) => {
    if (!session?.user?.id) return;
    if (file.size > MAX_BYTES) {
      toast({ title: "File too large", description: "Max 10 MB.", variant: "destructive" });
      return;
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      toast({
        title: "Unsupported file type",
        description: "Only PDF, PNG and JPEG files are allowed.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);

    // If offline (or farmer is a local-only draft not yet synced), queue upload
    const isLocalFarmer = farmerId.startsWith("local-");
    if (!navigator.onLine || isLocalFarmer) {
      await queueDocumentUpload({
        farmerId,
        organizationId,
        userId: session.user.id,
        documentType: docType,
        file,
      });
      toast({
        title: "Saved offline",
        description: "Document will upload when you're back online.",
      });
      setUploading(false);
      void syncManager.sync();
      return;
    }

    const ext = file.name.split(".").pop() || "bin";
    const docId = crypto.randomUUID();
    const path = `${organizationId}/${farmerId}/${docId}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("farmer-documents")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      // Fallback to offline queue on transient network failure
      await queueDocumentUpload({
        farmerId,
        organizationId,
        userId: session.user.id,
        documentType: docType,
        file,
      });
      toast({ title: "Saved offline", description: "Will retry automatically." });
      setUploading(false);
      return;
    }

    const { error: insErr } = await supabase.from("farmer_documents").insert({
      id: docId,
      farmer_id: farmerId,
      organization_id: organizationId,
      uploaded_by: session.user.id,
      document_type: docType,
      file_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      status: "pending",
    });
    if (insErr) {
      // best-effort cleanup
      await supabase.storage.from("farmer-documents").remove([path]);
      toast({ title: "Save failed", description: insErr.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    toast({ title: "Document uploaded" });
    setUploading(false);
    load();
  };

  const handleDownload = async (doc: FarmerDocument) => {
    const { data, error } = await supabase.storage
      .from("farmer-documents")
      .createSignedUrl(doc.file_path, 60);
    if (error || !data) {
      toast({ title: "Download error", description: error?.message, variant: "destructive" });
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = doc.file_name;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };


  const handleDelete = async (doc: FarmerDocument) => {
    if (!window.confirm(`Delete ${doc.file_name}?`)) return;
    await supabase.storage.from("farmer-documents").remove([doc.file_path]);
    const { error } = await supabase.from("farmer_documents").delete().eq("id", doc.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Document deleted" });
    load();
  };

  const handleVerify = async (doc: FarmerDocument, status: "verified" | "rejected") => {
    const notes =
      status === "rejected"
        ? window.prompt("Rejection reason (optional):", doc.notes || "") ?? doc.notes
        : doc.notes;
    const { error } = await supabase
      .from("farmer_documents")
      .update({
        status,
        verified_by: session?.user?.id,
        verified_at: new Date().toISOString(),
        notes,
      })
      .eq("id", doc.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: status === "verified" ? "Verified" : "Rejected" });
    load();
  };

  const statusBadge = (status: string) => {
    if (status === "verified")
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">
          <CheckCircle className="h-3 w-3" /> verified
        </span>
      );
    if (status === "rejected")
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
          <XCircle className="h-3 w-3" /> rejected
        </span>
      );
    return (
      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600">
        <Clock className="h-3 w-3" /> pending
      </span>
    );
  };

  return (
    <div className="kyf-card p-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <FileText className="h-4 w-4 text-primary" />
        Documents ({docs.length})
      </div>

      <RequiredDocumentsChecklist docs={docs} />


      {canEdit && (
        <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Document type
              </label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                File (PDF or image, max 10 MB)
              </label>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
                className="block w-full text-sm text-foreground file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:text-xs file:font-medium hover:file:opacity-90"
              />
            </div>
          </div>
          {uploading && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => {
            const typeLabel = DOC_TYPES.find((t) => t.value === d.document_type)?.label || d.document_type;
            const ownDraft = d.uploaded_by === session?.user?.id;
            const canDelete = isAdmin || ownDraft;
            return (
              <div
                key={d.id}
                className="rounded-lg border border-border p-3 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-primary">{typeLabel}</span>
                    {statusBadge(d.status)}
                  </div>
                  <p className="text-sm font-medium text-foreground truncate mt-0.5">
                    {d.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(d.file_size ? Math.round(d.file_size / 1024) : 0)} KB ·{" "}
                    {new Date(d.created_at).toLocaleDateString()}
                  </p>
                  {d.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">"{d.notes}"</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setPreviewDoc(d)}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownload(d)}
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>

                  {isAdmin && d.status !== "verified" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleVerify(d, "verified")}
                      className="text-green-600 hover:text-green-700"
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Verify
                    </Button>
                  )}
                  {isAdmin && d.status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleVerify(d, "rejected")}
                      className="text-destructive hover:text-destructive"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(d)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DocumentPreviewDialog
        doc={previewDoc}
        open={!!previewDoc}
        onOpenChange={(o) => !o && setPreviewDoc(null)}
      />
    </div>
  );
}

