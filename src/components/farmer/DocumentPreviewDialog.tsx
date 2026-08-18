import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GerminatingLogo } from "@/components/GerminatingLogo";
import { Download, FileText, CheckCircle, XCircle, Clock } from "lucide-react";

interface PreviewDoc {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  document_type: string;
  status: string;
}

interface Props {
  doc: PreviewDoc | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_LABELS: Record<string, string> = {
  id: "National ID",
  land_title: "Land Title",
  receipt: "Receipt",
  insurance: "Insurance",
  photo: "Photo",
  other: "Other",
};

function StatusBadge({ status }: { status: string }) {
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
}

export default function DocumentPreviewDialog({ doc, open, onOpenChange }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdBlobUrl: string | null = null;
    if (!open || !doc) {
      setUrl(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error } = await supabase.storage
        .from("farmer-documents")
        .createSignedUrl(doc.file_path, 300);
      if (cancelled) return;
      if (error || !data) {
        setError(error?.message || "Could not load file");
        setUrl(null);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(data.signedUrl);
        if (!res.ok) throw new Error("Failed to fetch file");
        const blob = await res.blob();
        const typedBlob =
          doc.mime_type && blob.type !== doc.mime_type
            ? new Blob([blob], { type: doc.mime_type })
            : blob;
        createdBlobUrl = URL.createObjectURL(typedBlob);
        if (cancelled) {
          URL.revokeObjectURL(createdBlobUrl);
          return;
        }
        setUrl(createdBlobUrl);
      } catch (e: any) {
        if (!cancelled) {
          setUrl(data.signedUrl);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
    };
  }, [open, doc]);

  const handleDownload = () => {
    if (!url || !doc) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_name;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const mime = doc?.mime_type || "";
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            <span className="truncate">{doc?.file_name}</span>
          </DialogTitle>
          {doc && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs font-semibold text-primary">
                {TYPE_LABELS[doc.document_type] || doc.document_type}
              </span>
              <StatusBadge status={doc.status} />
            </div>
          )}
        </DialogHeader>

        <div className="h-[75vh] bg-muted/30 flex items-center justify-center overflow-auto">
          {loading && <GerminatingLogo fullScreen={false} size="sm" message="Loading preview..." />}
          {!loading && error && (
            <p className="text-sm text-destructive p-6">{error}</p>
          )}
          {!loading && !error && url && doc && (
            <>
              {isImage && (
                <img
                  src={url}
                  alt={doc.file_name}
                  className="max-w-full max-h-full object-contain"
                />
              )}
              {isPdf && (
                <iframe
                  src={url}
                  title={doc.file_name}
                  className="w-full h-full border-0 bg-background"
                />
              )}
              {!isImage && !isPdf && (
                <div className="text-center p-6 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Preview not supported for this file type.
                  </p>
                  <Button onClick={handleDownload} variant="outline" size="sm">
                    <Download className="h-3.5 w-3.5 mr-1" /> Download to view
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleDownload} disabled={!url}>
            <Download className="h-4 w-4 mr-1" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
