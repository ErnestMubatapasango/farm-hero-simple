import { useRef, useState } from "react";
import { FileUp, Loader2, CheckCircle, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function FinancialStep({ financialInfo, setFormData, errors = {}, userId, uploadedDocs = {} }: any) {
  const loanDocType =
    financialInfo.loanStatus === "active" || financialInfo.loanStatus === "default"
      ? "loan_statement"
      : financialInfo.loanStatus === "repaid"
      ? "repayment_certificate"
      : null;

  const loanDocLabel =
    loanDocType === "loan_statement"
      ? "Loan Statement"
      : loanDocType === "repayment_certificate"
      ? "Certificate of Completion"
      : "";

  const uploadedLoanDoc = loanDocType ? uploadedDocs[loanDocType] : null;
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleLoanUpload(file: File) {
    if (!file || !userId || !loanDocType) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Max 10MB.");
      return;
    }
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Use PDF, JPG, PNG, or WebP.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `${userId}/${loanDocType}_${Date.now()}.${ext}`;
      const { error: storageErr } = await supabase.storage.from("farmer-documents").upload(filePath, file);
      if (storageErr) throw storageErr;
      const { data: docRecord, error: dbErr } = await supabase
        .from("documents")
        .insert({ user_id: userId, name: file.name, type: loanDocType, file_path: filePath, status: "pending" })
        .select()
        .single();
      if (dbErr) throw dbErr;
      setFormData((prev: any) => ({
        ...prev,
        uploadedDocs: { ...prev.uploadedDocs, [loanDocType]: { id: docRecord.id, name: file.name, filePath } },
      }));
      toast.success("Document uploaded");
    } catch (err: any) {
      toast.error("Upload failed: " + (err.message || "Unknown error"));
    } finally {
      setUploading(false);
    }
  }

  async function handleLoanRemove() {
    if (!uploadedLoanDoc || !loanDocType) return;
    try {
      if (uploadedLoanDoc.filePath) await supabase.storage.from("farmer-documents").remove([uploadedLoanDoc.filePath]);
      if (uploadedLoanDoc.id) await supabase.from("documents").delete().eq("id", uploadedLoanDoc.id);
      setFormData((prev: any) => {
        const updated = { ...prev.uploadedDocs };
        delete updated[loanDocType];
        return { ...prev, uploadedDocs: updated };
      });
      toast.success("Document removed");
    } catch {
      toast.error("Failed to remove document");
    }
  }

  const formatter = new Intl.NumberFormat("en-US");
  const formatNumber = (value) => {
    if (!value) return "";
    return formatter.format(value);
  };

  function handleChange(e) {
    const { name, value } = e.currentTarget;
    setFormData((prev) => ({
      ...prev,
      financialInfo: { ...prev.financialInfo, [name]: value },
    }));
  }

  function handleSelectChange(name, value) {
    setFormData((prev) => ({
      ...prev,
      financialInfo: { ...prev.financialInfo, [name]: value },
    }));
  }

  const errCls = (key: string) =>
    errors[key] ? "border-destructive ring-1 ring-destructive/30 focus-visible:ring-destructive" : "";

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-foreground">Financial Data</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="annualIncome">Estimated Annual Income (USD)</Label>
          <Input id="annualIncome" name="annualIncome" type="text" placeholder="8000" value={formatNumber(financialInfo.annualIncome)} onChange={(e) => handleChange({ currentTarget: { name: "annualIncome", value: e.currentTarget.value.replace(/[^\d]/g, "") } } as any)} className={errCls("financial.annualIncome")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="annualExpenses">Annual Farm Expenses (USD)</Label>
          <Input id="annualExpenses" name="annualExpenses" type="text" placeholder="3500" value={formatNumber(financialInfo.annualExpenses)} onChange={(e) => handleChange({ currentTarget: { name: "annualExpenses", value: e.currentTarget.value.replace(/[^\d]/g, "") } } as any)} />
        </div>
        <div className="space-y-1.5">
          <Label>Do you have a bank account?</Label>
          <Select value={financialInfo.hasBankAccount} onValueChange={(v) => handleSelectChange("hasBankAccount", v)}>
            <SelectTrigger className={errCls("financial.hasBankAccount")}><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="mobile">Mobile money only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Previous loans?</Label>
          <Select value={financialInfo.loanStatus} onValueChange={(v) => handleSelectChange("loanStatus", v)}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No previous loans</SelectItem>
              <SelectItem value="active">Active loan</SelectItem>
              <SelectItem value="repaid">Fully repaid</SelectItem>
              <SelectItem value="default">Defaulted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {financialInfo.hasBankAccount === "yes" && (
          <>
            <div className="space-y-1.5">
              <Label>Bank Name</Label>
              <Select value={financialInfo.bankName} onValueChange={(v) => handleSelectChange("bankName", v)}>
                <SelectTrigger className={errCls("financial.bankName")}><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nmb">NMB Bank</SelectItem>
                  <SelectItem value="nedbank">NedBank</SelectItem>
                  <SelectItem value="cabs">CABS Bank</SelectItem>
                  <SelectItem value="cbz">CBZ Bank</SelectItem>
                  <SelectItem value="first-mutual">First Mutual Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bankAccountNumber">Bank Acc No.</Label>
              <Input id="bankAccountNumber" name="bankAccountNumber" type="text" placeholder="AEC9933..." value={financialInfo.bankAccountNumber} onChange={handleChange} className={errCls("financial.bankAccountNumber")} />
            </div>
          </>
        )}
      </div>
      {loanDocType && (
        <div className="space-y-1.5">
          <Label>{loanDocLabel}</Label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            ref={fileRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleLoanUpload(file);
              e.target.value = "";
            }}
          />
          {uploadedLoanDoc ? (
            <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                <p className="text-sm text-foreground truncate">{uploadedLoanDoc.name}</p>
              </div>
              <button
                type="button"
                onClick={handleLoanRemove}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-lg border border-dashed border-border p-4 text-center hover:border-primary/40 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 text-muted-foreground mx-auto mb-1.5 animate-spin" />
              ) : (
                <FileUp className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
              )}
              <p className="text-xs font-medium text-foreground">
                {uploading ? "Uploading..." : `Upload ${loanDocLabel}`}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">PDF, JPG, PNG (max 10MB)</p>
            </button>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="financialNotes">Additional notes</Label>
        <Textarea id="financialNotes" name="notes" placeholder="Any other financial information..." rows={2} value={financialInfo.notes} onChange={handleChange} />
      </div>
    </div>
  );
}
