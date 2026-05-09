import { useState, useEffect } from "react";
import { Check, ChevronLeft, ChevronRight, User, MapPin, Sprout, Banknote, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

import PersonalStep from "@/components/onboarding/PersonalStep";
import FarmStep from "@/components/onboarding/FarmStep";
import CropsStep from "@/components/onboarding/CropsStep";
import FinancialStep from "@/components/onboarding/FinancialStep";
import DocumentsStep from "@/components/onboarding/DocumentsStep";

const steps = [
  { id: 0, title: "Personal", icon: User },
  { id: 1, title: "Farm", icon: MapPin },
  { id: 2, title: "Crops", icon: Sprout },
  { id: 3, title: "Financial", icon: Banknote },
  { id: 4, title: "Documents", icon: FileUp },
];

export default function Onboarding() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState({
    personalInfo: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      dob: "",
      gender: "",
      address: "",
    },
    farmInfo: {
      farmName: "",
      farmSizeHectares: "",
      region: "",
      district: "",
      latitude: "",
      longitude: "",
    },
    cropInfo: {
      primaryCrop: "",
      secondaryCrop: "",
      farmingMethods: {} as Record<string, string>,
    },
    yieldHistory: {},
    financialInfo: {
      annualIncome: "",
      annualExpenses: "",
      hasBankAccount: "",
      bankAccountNumber: "",
      bankName: "",
      loanStatus: "",
      notes: "",
    },
    uploadedDocs: {},
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    const loadExisting = async () => {
      try {
        const [profileRes, farmRes, finRes, docsRes, cropRes] = await Promise.all([
          supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
          supabase.from("farm_profiles").select("*").eq("user_id", userId).maybeSingle(),
          supabase.from("financial_records").select("*").eq("user_id", userId).maybeSingle(),
          supabase.from("documents").select("*").eq("user_id", userId),
          supabase.from("crop_history").select("*").eq("user_id", userId),
        ]);

        const p = profileRes.data;
        const f = farmRes.data;
        const fi = finRes.data;
        const docs = docsRes.data || [];
        const cropRows = cropRes.data || [];

        const yieldHistoryLoaded = cropRows.reduce((acc, row) => {
          const key = `${row.crop}_${row.year}`;
          acc[key] = { yield: row.yield_amount?.toString() || "", revenue: row.revenue?.toString() || "" };
          return acc;
        }, {});



        setFormData((prev) => ({
          ...prev,
          personalInfo: {
            firstName: p?.first_name || "",
            lastName: p?.last_name || "",
            phone: p?.phone || "",
            email: p?.email || "",
            dob: p?.date_of_birth || "",
            gender: p?.gender || "",
            address: p?.address || "",
          },
          farmInfo: {
            farmName: f?.farm_name || "",
            farmSizeHectares: f?.farm_size_hectares?.toString() || "",
            region: f?.region || "",
            district: f?.district || "",
            latitude: f?.coordinates_latitude || "",
            longitude: f?.coordinates_longitude || "",
          },
          cropInfo: {
            primaryCrop: f?.primary_crop || "",
            secondaryCrop: f?.secondary_crop || "",
            farmingMethods: (f?.farming_methods && typeof f.farming_methods === 'object' && !Array.isArray(f.farming_methods))
              ? (f.farming_methods as Record<string, string>)
              : {},
          },
          financialInfo: {
            annualIncome: fi?.annual_income?.toString() || "",
            annualExpenses: fi?.annual_expenses?.toString() || "",
            hasBankAccount: fi?.has_bank_account || "",
            bankAccountNumber: fi?.bank_account_number || "",
            bankName: fi?.bank_name || "",
            loanStatus: fi?.loan_status || "",
            notes: fi?.notes || "",
          },
          yieldHistory: yieldHistoryLoaded,
          uploadedDocs: docs.reduce((acc, doc) => {
            acc[doc.type] = { id: doc.id, name: doc.name, filePath: doc.file_path, status: doc.status };
            return acc;
          }, {}),
        }));
      } catch (err) {
        console.error("Failed to load existing data:", err);
      } finally {
        setLoading(false);
      }
    };

    loadExisting();
  }, [userId]);

  const validateStep = (step: number): { ok: boolean; missing: string[]; errs: Record<string, boolean> } => {
    const errs: Record<string, boolean> = {};
    const missing: string[] = [];
    const req = (key: string, value: any, label: string) => {
      const empty = value === undefined || value === null || (typeof value === "string" && !value.trim());
      if (empty) {
        errs[key] = true;
        missing.push(label);
      }
    };

    if (step === 0) {
      const p = formData.personalInfo;
      req("personal.firstName", p.firstName, "First Name");
      req("personal.lastName", p.lastName, "Last Name");
      req("personal.phone", p.phone, "Phone Number");
      req("personal.dob", p.dob, "Date of Birth");
      req("personal.gender", p.gender, "Gender");
      req("personal.address", p.address, "Address");
    } else if (step === 1) {
      const f = formData.farmInfo;
      req("farm.farmName", f.farmName, "Farm Name");
      req("farm.farmSizeHectares", f.farmSizeHectares, "Farm Size");
      req("farm.region", f.region, "Region");
      req("farm.district", f.district, "District");
    } else if (step === 2) {
      const d = formData.cropInfo;
      req("crop.primaryCrop", d.primaryCrop, "Primary Crop");
      const selected = [d.primaryCrop, d.secondaryCrop].filter(Boolean);
      const methods = d.farmingMethods || {};
      selected.forEach((c) => {
        if (!methods[c]) {
          errs[`crop.method.${c}`] = true;
          missing.push(`Farming Method for ${c}`);
        }
      });
    } else if (step === 3) {
      const fi = formData.financialInfo;
      req("financial.annualIncome", fi.annualIncome, "Annual Income");
      req("financial.hasBankAccount", fi.hasBankAccount, "Bank Account Status");
      if (fi.hasBankAccount === "yes") {
        req("financial.bankName", fi.bankName, "Bank Name");
        req("financial.bankAccountNumber", fi.bankAccountNumber, "Bank Account Number");
      }
    }
    return { ok: missing.length === 0, missing, errs };
  };

  const next = () => {
    const { ok, missing, errs } = validateStep(current);
    if (!ok) {
      setErrors(errs);
      toast.error(`Please correct: ${missing.join(", ")}`);
      return;
    }
    setErrors({});
    setCurrent((c) => Math.min(c + 1, steps.length - 1));
  };

  const prev = () => setCurrent((c) => Math.max(c - 1, 0));

  const saveDraft = () => toast.success("Draft saved successfully");

  const submit = async () => {
    if (!userId) {
      toast.error("You must be logged in to submit.");
      return;
    }

    setSubmitting(true);

    try {
      const p = formData.personalInfo;
      // Upsert profile
      const { error: profileErr } = await supabase
        .from("profiles")
        .upsert({
          user_id: userId,
          first_name: p.firstName || null,
          last_name: p.lastName || null,
          phone: p.phone,
          email: p.email || null,
          date_of_birth: p.dob || null,
          gender: p.gender || null,
          address: p.address || null,
        }, { onConflict: "user_id" });

      if (profileErr) throw profileErr;

      // Upsert farm profile
      const f = formData.farmInfo;
      const cr = formData.cropInfo;
      const { error: farmErr } = await supabase
        .from("farm_profiles")
        .upsert({
          user_id: userId,
          farm_name: f.farmName || null,
          farm_size_hectares: f.farmSizeHectares ? Number(f.farmSizeHectares) : null,
          region: f.region || null,
          district: f.district || null,
          coordinates_latitude: f.latitude || null,
          coordinates_longitude: f.longitude || null,
          primary_crop: cr.primaryCrop || null,
          secondary_crop: cr.secondaryCrop || null,
          farming_methods: cr.farmingMethods && Object.keys(cr.farmingMethods).length > 0
            ? cr.farmingMethods
            : null,
          status: "submitted",
          completeness: 100,
          submitted_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (farmErr) throw farmErr;

      // Upsert financial record
      const fi = formData.financialInfo;
      const { error: finErr } = await supabase
        .from("financial_records")
        .upsert({
          user_id: userId,
          annual_income: fi.annualIncome ? Number(fi.annualIncome) : null,
          annual_expenses: fi.annualExpenses ? Number(fi.annualExpenses) : null,
          has_bank_account: fi.hasBankAccount || null,
          bank_account_number: fi.bankAccountNumber || null,
          bank_name: fi.bankName || null,
          loan_status: fi.loanStatus || null,
          notes: fi.notes || null,
        }, { onConflict: "user_id" });

      if (finErr) throw finErr;

      // Delete existing crop history then insert new 2-year data
      const selectedCrops = [cr.primaryCrop, cr.secondaryCrop].filter(Boolean);
      const currentYear = new Date().getFullYear();
      const previousYear = currentYear - 1;

      await supabase.from("crop_history").delete().eq("user_id", userId);

      // const cropRows = [];
      // selectedCrops.forEach((crop) => {
      //   [previousYear, currentYear].forEach((year) => {
      //     const key = `${crop}_${year}`;
      //     const y = formData.yieldHistory[key];
      //     cropRows.push({
      //       user_id: userId,
      //       crop,
      //       year,
      //       yield_amount: y?.yield ? Number(y.yield) : null,
      //       yield_unit: "kg",
      //       revenue: y?.revenue ? Number(y.revenue) : null,
      //     });
      //   });
      // });

      // if (cropRows.length > 0) {
      //   const { error: cropErr } = await supabase.from("crop_history").insert(cropRows);
      //   if (cropErr) throw cropErr;
      // }
      // Filter only for entries that actually have data to avoid inserting empty rows
      const cropRows = [];
      selectedCrops.forEach((crop) => {
        [previousYear, currentYear].forEach((year) => {
          const key = `${crop}_${year}`;
          const y = formData.yieldHistory[key];
          
          // Only push if there's actually a yield or revenue value
          if (y?.yield || y?.revenue) {
            cropRows.push({
              user_id: userId,
              crop,
              year,
              yield_amount: y?.yield ? Number(y.yield) : null,
              yield_unit: "kg",
              revenue: y?.revenue ? Number(y.revenue) : null,
            });
          }
        });
      });

      if (cropRows.length > 0) {
        // Use upsert with onConflict if you have a unique constraint on (user_id, crop, year)
        // Otherwise, the delete-then-insert should be wrapped in a more robust error check
        const { error: cropErr } = await supabase.from("crop_history").upsert(cropRows, {
          onConflict: 'user_id,crop,year' 
        });
        if (cropErr) throw cropErr;
      }

      toast.success("Profile submitted for verification!");
    } catch (err) {
      console.error("Submit error:", err);
      toast.error("Submission failed: " + (err.message || "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground">Loading your profile data...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto space-y-6 sm:space-y-8">
      <div className="kyf-slide-up">
        <h1 className="text-2xl font-bold text-foreground">Farmer Onboarding</h1>
        <p className="text-muted-foreground mt-1">Complete all sections to submit your agricultural profile.</p>
      </div>

      {/* Progress */}
      <div className="kyf-slide-up" style={{ animationDelay: "80ms" }}>
        {/* Mobile: compact step indicator */}
        <div className="flex sm:hidden items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Step {current + 1} of {steps.length}</span>
          <span className="text-xs font-semibold text-foreground">{steps[current].title}</span>
        </div>
        <div className="flex items-center gap-1">
          {steps.map((step, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <div key={step.id} className="flex items-center flex-1">
                <button
                  onClick={() => setCurrent(i)}
                  className={cn(
                    "flex items-center justify-center sm:justify-start gap-2 rounded-lg px-2 sm:px-3 py-2 text-xs font-medium transition-colors w-full min-w-0",
                    active && "bg-primary text-primary-foreground",
                    done && "bg-kyf-sage-light text-primary",
                    !active && !done && "bg-muted text-muted-foreground"
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5 shrink-0" /> : <step.icon className="h-3.5 w-3.5 shrink-0" />}
                  <span className="hidden sm:inline truncate">{step.title}</span>
                </button>
                {i < steps.length - 1 && <div className="h-px w-2 bg-border shrink-0 hidden sm:block" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Form Content */}
      <div className="kyf-card-flat p-4 sm:p-6 md:p-8 kyf-fade-in" key={current}>
        {current === 0 && <PersonalStep personalInfo={formData.personalInfo} setFormData={setFormData} errors={errors} />}
        {current === 1 && <FarmStep farmInfo={formData.farmInfo} setFormData={setFormData} errors={errors} />}
        {current === 2 && <CropsStep cropInfo={formData.cropInfo} yieldHistory={formData.yieldHistory} setFormData={setFormData} errors={errors} />}
        {current === 3 && <FinancialStep financialInfo={formData.financialInfo} setFormData={setFormData} errors={errors} userId={userId} uploadedDocs={formData.uploadedDocs} />}
        {current === 4 && <DocumentsStep userId={userId} uploadedDocs={formData.uploadedDocs} setFormData={setFormData} />}
      </div>

      {/* Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={prev}
          disabled={current === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <button
          onClick={saveDraft}
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Save draft
        </button>
        {current < steps.length - 1 ? (
          <button
            onClick={next}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97]"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Profile"}
          </button>
        )}
      </div>
    </div>
  );
}