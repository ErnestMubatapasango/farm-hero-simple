import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  const { session, organizationId, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("personal");
  const [form, setForm] = useState<FarmerFormState>(initialData ?? emptyFarmerForm);
  const [submitting, setSubmitting] = useState(false);

  const canOnboard = hasAnyRole(["enumerator", "admin", "super_admin", "developer"]);

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

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const goNext = () => stepIndex < STEPS.length - 1 && setStep(STEPS[stepIndex + 1].key);
  const goBack = () => stepIndex > 0 && setStep(STEPS[stepIndex - 1].key);

  const handleSubmit = async () => {
    if (!session?.user?.id || !organizationId) return;

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

    const { data: resolvedFarmerId, error: rpcError } = await supabase.rpc("save_farmer", {
      _farmer_id: mode === "edit" ? farmerId ?? null : null,
      _payload: payload as any,
      _crops: cropsPayload as any,
      _yields: yieldsPayload as any,
    });

    if (rpcError || !resolvedFarmerId) {
      toast({
        title: mode === "edit" ? "Error updating farmer" : "Error creating farmer",
        description: rpcError?.message ?? "Unknown error",
        variant: "destructive",
      });
      setSubmitting(false);
      return;
    }

    if (mode === "create") {
      toast({
        title: "Farmer registered",
        description: `${form.first_name} ${form.last_name} has been onboarded successfully.`,
      });
      setForm(emptyFarmerForm);
      setStep("personal");
      setSubmitting(false);
      navigate("/");
    } else {
      toast({ title: "Farmer updated", description: "Changes saved successfully." });
      setSubmitting(false);
      navigate(`/admin/farmer/${resolvedFarmerId}`);
    }
  };

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
                <Input type="date" value={form.date_of_birth} onChange={(e) => update("date_of_birth", e.target.value)} required />
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
                <Input value={form.farm_size_hectares} onChange={(e) => update("farm_size_hectares", e.target.value)} type="number" placeholder="4.2" />
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
                <Input value={form.annual_income} onChange={(e) => update("annual_income", e.target.value)} type="number" placeholder="0.00" />
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
              disabled={
                (step === "personal" && (!form.first_name || !form.last_name)) ||
                (step === "crops" && !form.cropInfo.primaryCrop)
              }
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !form.first_name || !form.last_name}
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
