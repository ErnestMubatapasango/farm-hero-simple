import { FileText } from "lucide-react";

export default function Documents() {
  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Documents</h1>
        <p className="text-muted-foreground mt-1">Manage and verify farmer documents.</p>
      </div>
      <div className="kyf-card-flat p-8 text-center">
        <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Document upload and verification will be available in Phase 2.
        </p>
      </div>
    </div>
  );
}
