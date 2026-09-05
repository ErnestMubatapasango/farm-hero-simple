import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { isOrgAdmin, canOnboardFarmers } from "@/lib/permissions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sprout, User, Tractor, Wallet, ChevronRight, ChevronLeft, Check, Loader2 } from "lucide-react";
import { zimbabweProvinces } from "@/components/onboarding/utils";
import CropsStep from "@/components/onboarding/CropsStep";
import { saveFarmer as offlineSaveFarmer } from "@/lib/offline/farmerRepo";
import { syncManager } from "@/lib/offline/syncManager";
import FarmerDocumentsSection from "@/components/farmer/FarmerDocumentsSection";
import { supabase } from "@/integrations/supabase/client";
import {
  ANNUAL_INCOME_MAX,
  ANNUAL_INCOME_MIN,
  ANNUAL_INCOME_STEP,
  FARM_SIZE_MAX,
  FARM_SIZE_STEP,
  NATIONAL_ID_EXAMPLE,
  maxDateOfBirth,
  minDateOfBirth,
  normalizeNationalId,
  validateAnnualIncome,
  validateDateOfBirth,
  validateFarmSize,
  validateNationalId,
  validateYieldHistory,
} from "@/lib/farmer-validation";


type Step = "personal" | "farm" | "crops" | "financial";

const STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: "personal", label: "Personal", icon: User },
  { key: "farm", label: "Farm", icon: Tractor },
  { key: "crops", label: "Crops", icon: Sprout },
  { key: "financial", label: "Financial", icon: Wallet },
];

export interface CropInfo {
  primaryCrop: string;
  secondaryCrop: string;
  farmingMethods: Record<string, string>;
}

export interface YieldEntry {
  yield: string;
  revenue: string;
}

export interface FarmerFormState {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  date_of_birth: string;
  gender: string;
  national_id: string;
  region: string;
  district: string;
  ward: string;
  village: string;
  farm_name: string;
  farm_size_hectares: string;
  primary_livestock: string[];
  cropInfo: CropInfo;
  yieldHistory: Record<string, YieldEntry>;
  annual_income: string;
  has_bank_account: boolean;
  bank_name: string;
  mobile_money_provider: string;
  notes: string;
}

export const emptyFarmerForm: FarmerFormState = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  date_of_birth: "",
  gender: "",
  national_id: "",
  region: "",
  district: "",
  ward: "",
  village: "",
  farm_name: "",
  farm_size_hectares: "",
  primary_livestock: [],
  cropInfo: { primaryCrop: "", secondaryCrop: "", farmingMethods: {} },
  yieldHistory: {},
  annual_income: "",
  has_bank_account: false,
  bank_name: "",
  mobile_money_provider: "",
  notes: "",
};

const currentYear = new Date().getFullYear();
const previousYear = currentYear - 1;

const LIVESTOCK_OPTIONS = ["Cattle", "Goats", "Sheep", "Poultry", "Pigs", "Donkeys", "Rabbits", "Fish"];

interface FarmerFormProps {
  mode: "create" | "edit";
  initialData?: FarmerFormState;
  farmerId?: string;
  title?: string;
  subtitle?: string;
}

export default function FarmerForm({ mode, initialData, farmerId, title, subtitle }: FarmerFormProps) {
  const { roles, session, organizationId, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("personal");
  const [form, setForm] = useState<FarmerFormState>(initialData ?? emptyFarmerForm);
  const [submitting, setSubmitting] = useState(false);
  const [savedFarmer, setSavedFarmer] = useState<{ id: string; name: string } | null>(null);
  const [identity, setIdentity] = useState<{
    known: boolean;
    full_name: string | null;
    date_of_birth: string | null;
    in_my_org: boolean;
    my_org_farmer_id: string | null;
  } | null>(null);
  const [checkingIdentity, setCheckingIdentity] = useState(false);

  const canOnboard = canOnboardFarmers(roles);

  if (!canOnboard) {
    return (
      <div className="p-8 max-w-md mx-auto">
        <div className="kyf-card p-6 text-center">
          <p className="text-sm text-muted-foreground">You don't have permission to {mode === "edit" ? "edit" : "onboard"} farmers.</p>
        </div>
      </div>
    );
  }

  const update = (field: keyof FarmerFormState, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // ---- validation (mirrors the DB CHECK constraints + save_farmer RPC) ----
  const dobError = validateDateOfBirth(form.date_of_birth);
  const farmSizeError = validateFarmSize(form.farm_size_hectares);
  const incomeError = validateAnnualIncome(form.annual_income);
  const nationalIdError = validateNationalId(form.national_id);
  const yieldErrors = useMemo(() => validateYieldHistory(form.yieldHistory), [form.yieldHistory]);
  const hasYieldErrors = Object.keys(yieldErrors).length > 0;

  const duplicateFarmerId =
    identity?.in_my_org && identity.my_org_farmer_id && identity.my_org_farmer_id !== farmerId
      ? identity.my_org_farmer_id
      : null;

  const lookupIdentity = async () => {
    const nid = normalizeNationalId(form.national_id);
    if (validateNationalId(nid)) {
      setIdentity(null);
      return;
    }
    setCheckingIdentity(true);
    const { data, error } = await supabase.rpc("check_farmer_identity", { _national_id: nid });
    setCheckingIdentity(false);
    if (error) {
      setIdentity(null);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setIdentity(row ?? null);
  };

  const stepInvalid: Record<Step, boolean> = {
    personal:
      !form.first_name ||
      !form.last_name ||
      Boolean(dobError) ||
      Boolean(nationalIdError) ||
      Boolean(duplicateFarmerId),
    farm: Boolean(farmSizeError),
    crops: !form.cropInfo.primaryCrop || hasYieldErrors,
    financial: Boolean(incomeError),
  };
  const formInvalid =
    stepInvalid.personal || stepInvalid.farm || stepInvalid.crops || stepInvalid.financial;

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const goNext = () => {
    if (stepInvalid[step]) return;
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1].key);
  };
  const goBack = () => stepIndex > 0 && setStep(STEPS[stepIndex - 1].key);


  const handleSubmit = async () => {
    if (!session?.user?.id || !organizationId) return;

    const firstInvalidStep = (["personal", "farm", "crops", "financial"] as Step[]).find(
      (s) => stepInvalid[s],
    );
    if (firstInvalidStep) {
      toast({
        title: "Please fix the highlighted fields",
        description:
          dobError ?? farmSizeError ?? incomeError ?? Object.values(yieldErrors)[0] ??
          "Some required information is missing.",
        variant: "destructive",
      });
      setStep(firstInvalidStep);
      return;
    }



    const selectedCrops = [form.cropInfo.primaryCrop, form.cropInfo.secondaryCrop].filter(Boolean);
    for (const c of selectedCrops) {
      if (!form.cropInfo.farmingMethods[c]) {
        toast({
          title: "Missing farming method",
          description: `Please choose a farming method for ${c}.`,
          variant: "destructive",
        });
        setStep("crops");
        return;
      }
    }

    setSubmitting(true);

    const livestock = form.primary_livestock;

    const payload = {
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone,
      email: form.email,
      date_of_birth: form.date_of_birth,
      gender: form.gender,
      national_id: form.national_id,
      region: form.region,
      district: form.district,
      ward: form.ward,
      village: form.village,
      farm_name: form.farm_name,
      farm_size_hectares: form.farm_size_hectares,
      primary_crops: selectedCrops,
      primary_livestock: livestock,
      annual_income: form.annual_income,
      has_bank_account: form.has_bank_account,
      bank_name: form.bank_name,
      mobile_money_provider: form.mobile_money_provider,
      notes: form.notes,
    };

    const cropsPayload = selectedCrops.map((crop, idx) => ({
      crop,
      position: idx + 1,
      farming_method: form.cropInfo.farmingMethods[crop] || null,
    }));

    const yieldsPayload: Array<{ crop: string; year: number; yield_kg: string; revenue_usd: string }> = [];
    for (const crop of selectedCrops) {
      for (const year of [previousYear, currentYear]) {
        const entry = form.yieldHistory[`${crop}_${year}`];
        if (!entry) continue;
        if (!entry.yield && !entry.revenue) continue;
        yieldsPayload.push({
          crop,
          year,
          yield_kg: entry.yield || "",
          revenue_usd: entry.revenue || "",
        });
      }
    }

    let resolvedFarmerId: string;
    let queued = false;
    try {
      const result = await offlineSaveFarmer({
        farmerId: mode === "edit" ? farmerId ?? null : null,
        organizationId,
        userId: session.user.id,
        payload,
        crops: cropsPayload,
        yields: yieldsPayload,
      });
      resolvedFarmerId = result.farmerId;
      queued = result.queued;
    } catch (err: any) {
      toast({
        title: mode === "edit" ? "Error updating farmer" : "Error creating farmer",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
      setSubmitting(false);
      return;
    }

    // Kick sync in the background if we queued or after a successful online write.
    void syncManager.sync();

    if (mode === "create") {
      toast({
        title: queued ? "Saved offline" : "Farmer registered",
        description: queued
          ? `${form.first_name} ${form.last_name} will sync when you're back online.`
          : `${form.first_name} ${form.last_name} has been onboarded. Upload their documents below.`,
      });
      setSubmitting(false);
      if (queued) {
        // Local-only: no docs upload panel yet — go back to dashboard
        setForm(emptyFarmerForm);
        setStep("personal");
        navigate("/");
      } else {
        setSavedFarmer({
          id: resolvedFarmerId,
          name: `${form.first_name} ${form.last_name}`,
        });
      }
    } else {
      toast({
        title: queued ? "Saved offline" : "Farmer updated",
        description: queued ? "Changes will sync when you're back online." : "Changes saved successfully.",
      });
      setSubmitting(false);
      navigate(queued ? "/" : `/admin/farmer/${resolvedFarmerId}`);
    }
  };

  if (savedFarmer && organizationId) {
    return (
      <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Upload documents</h1>
          <p className="text-muted-foreground mt-1">
            {savedFarmer.name} has been onboarded. Attach their required documents (National ID, Land Title)
            and any supporting files before wrapping up.
          </p>
        </div>

        <FarmerDocumentsSection
          farmerId={savedFarmer.id}
          organizationId={organizationId}
          canEdit
          isAdmin={isOrgAdmin(roles)}
        />

        <div className="flex flex-col sm:flex-row gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => {
              setSavedFarmer(null);
              setForm(emptyFarmerForm);
              setStep("personal");
            }}
          >
            Onboard another farmer
          </Button>
          <Button onClick={() => navigate(`/admin/farmer/${savedFarmer.id}`)}>
            Go to farmer record
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  const headerTitle = title ?? (mode === "edit" ? "Edit Farmer" : "Farmer Onboarding");
  const headerSubtitle = subtitle ?? (mode === "edit" ? "Update this farmer's information." : "Register a new farmer into the system.");

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{headerTitle}</h1>
        <p className="text-muted-foreground mt-1">{headerSubtitle}</p>
      </div>

      <div className="flex gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = s.key === step;
          const isDone = i < stepIndex;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setStep(s.key)}
              className={`flex items-center gap-2 flex-1 rounded-lg px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isDone
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="kyf-card p-5 sm:p-6 space-y-5">
        {step === "personal" && (
          <>
            <h2 className="text-lg font-semibold text-foreground">Personal Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>First Name </Label>
                <Input value={form.first_name} onChange={(e) => update("first_name", e.target.value)} placeholder="Enter first name..." required />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name </Label>
                <Input value={form.last_name} onChange={(e) => update("last_name", e.target.value)} placeholder="Enter last name..." required />
              </div>
              <div className="space-y-1.5">
                <Label>Phone </Label>
                <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+263..." required />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="farmer@example.com" required />
              </div>
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => update("date_of_birth", e.target.value)}
                  min={minDateOfBirth()}
                  max={maxDateOfBirth()}
                  aria-invalid={Boolean(dobError)}
                  className={dobError ? "border-destructive focus-visible:ring-destructive" : ""}
                  required
                />
                {dobError && <p className="text-xs text-destructive">{dobError}</p>}

              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={(v) => update("gender", v)}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>National ID </Label>
                <Input value={form.national_id} onChange={(e) => update("national_id", e.target.value)} placeholder="Enter national ID number..." required />
              </div>
            </div>
          </>
        )}

        {step === "farm" && (
          <>
            <h2 className="text-lg font-semibold text-foreground">Farm Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Farm Name</Label>
                <Input value={form.farm_name} onChange={(e) => update("farm_name", e.target.value)} placeholder="e.g. Golden Cocoa Estate" />
              </div>
              <div className="space-y-1.5">
                <Label>Farm Size (hectares)</Label>
                <Input
                  value={form.farm_size_hectares}
                  onChange={(e) => update("farm_size_hectares", e.target.value)}
                  type="number"
                  min={FARM_SIZE_STEP}
                  max={FARM_SIZE_MAX}
                  step={FARM_SIZE_STEP}
                  placeholder="4.2"
                  aria-invalid={Boolean(farmSizeError)}
                  className={farmSizeError ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {farmSizeError ? (
                  <p className="text-xs text-destructive">{farmSizeError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Greater than 0, up to {FARM_SIZE_MAX.toLocaleString()} ha.
                  </p>
                )}

              </div>
              <div className="space-y-1.5">
                <Label>Region (Province)</Label>
                <Select value={form.region} onValueChange={(v) => update("region", v)}>
                  <SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger>
                  <SelectContent>
                    {zimbabweProvinces.map((p) => (
                      <SelectItem key={p.province} value={p.province}>
                        {p.province}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>District / Sub-County</Label>
                <Input value={form.district} onChange={(e) => update("district", e.target.value)} placeholder="District name" />
              </div>
              <div className="space-y-1.5">
                <Label>Ward</Label>
                <Input value={form.ward} onChange={(e) => update("ward", e.target.value)} placeholder="Ward" />
              </div>
              <div className="space-y-1.5">
                <Label>Village</Label>
                <Input value={form.village} onChange={(e) => update("village", e.target.value)} placeholder="Village" />
              </div>
            </div>
          </>
        )}

        {step === "crops" && (
          <>
            <CropsStep
              cropInfo={form.cropInfo}
              yieldHistory={form.yieldHistory}
              errors={yieldErrors}

              setFormData={(updater: (prev: FarmerFormState) => FarmerFormState) =>
                setForm((prev) => updater(prev))
              }
            />

            <div className="space-y-2 pt-2">
              <Label>Livestock (optional)</Label>
              <p className="text-xs text-muted-foreground">Select all that apply.</p>
              <div className="flex flex-wrap gap-2">
                {LIVESTOCK_OPTIONS.map((opt) => {
                  const selected = form.primary_livestock.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          primary_livestock: selected
                            ? prev.primary_livestock.filter((l) => l !== opt)
                            : [...prev.primary_livestock, opt],
                        }))
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {step === "financial" && (
          <>
            <h2 className="text-lg font-semibold text-foreground">Financial Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Annual Income (USD)</Label>
                <Input
                  value={form.annual_income}
                  onChange={(e) => update("annual_income", e.target.value)}
                  type="number"
                  min={ANNUAL_INCOME_MIN}
                  max={ANNUAL_INCOME_MAX}
                  step={ANNUAL_INCOME_STEP}
                  placeholder="0.00"
                  aria-invalid={Boolean(incomeError)}
                  className={incomeError ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {incomeError ? (
                  <p className="text-xs text-destructive">{incomeError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Between {ANNUAL_INCOME_MIN} and {ANNUAL_INCOME_MAX.toLocaleString()}.
                  </p>
                )}

              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm pt-7">
                  <input
                    type="checkbox"
                    checked={form.has_bank_account}
                    onChange={(e) => update("has_bank_account", e.target.checked)}
                    className="rounded border-border"
                  />
                  Has Bank Account
                </label>
              </div>
              {form.has_bank_account && (
                <div className="space-y-1.5">
                  <Label>Bank Name</Label>
                  <Input value={form.bank_name} onChange={(e) => update("bank_name", e.target.value)} placeholder="Enter bank name" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Mobile Money Provider</Label>
                <Select value={form.mobile_money_provider} onValueChange={(v) => update("mobile_money_provider", v)}>
                  <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ecocash">Ecocash</SelectItem>
                    <SelectItem value="netone">Netone</SelectItem>
                    <SelectItem value="mukuru">Mukuru</SelectItem>
                    <SelectItem value="world-remit">World Remit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Any additional observations..." rows={3} />
              </div>
            </div>
          </>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <button
            type="button"
            onClick={goBack}
            disabled={stepIndex === 0}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {stepIndex < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={stepInvalid[step]}

              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || formInvalid}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {submitting ? "Saving..." : mode === "edit" ? "Save Changes" : "Register Farmer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
