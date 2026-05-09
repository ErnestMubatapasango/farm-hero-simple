import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sprout, User, MapPin, Tractor, Wallet, ChevronRight, ChevronLeft, Check, Loader2 } from "lucide-react";

type Step = "personal" | "location" | "farm" | "financial";

const STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: "personal", label: "Personal", icon: User },
  { key: "location", label: "Location", icon: MapPin },
  { key: "farm", label: "Farm", icon: Tractor },
  { key: "financial", label: "Financial", icon: Wallet },
];

interface FarmerForm {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  date_of_birth: string;
  gender: string;
  national_id: string;
  county: string;
  sub_county: string;
  ward: string;
  village: string;
  farm_name: string;
  farm_size_acres: string;
  farming_type: string;
  primary_crops: string;
  primary_livestock: string;
  annual_income: string;
  has_bank_account: boolean;
  bank_name: string;
  mobile_money_provider: string;
  notes: string;
}

const emptyForm: FarmerForm = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  date_of_birth: "",
  gender: "",
  national_id: "",
  county: "",
  sub_county: "",
  ward: "",
  village: "",
  farm_name: "",
  farm_size_acres: "",
  farming_type: "mixed",
  primary_crops: "",
  primary_livestock: "",
  annual_income: "",
  has_bank_account: false,
  bank_name: "",
  mobile_money_provider: "",
  notes: "",
};

export default function Onboarding() {
  const { session, organizationId, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("personal");
  const [form, setForm] = useState<FarmerForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const canOnboard = hasAnyRole(["enumerator", "admin", "super_admin", "developer"]);

  if (!canOnboard) {
    return (
      <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto">
        <div className="kyf-card-flat p-8 text-center">
          <Sprout className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">You don't have permission to onboard farmers.</p>
        </div>
      </div>
    );
  }

  const update = (field: keyof FarmerForm, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const goNext = () => {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1].key);
  };
  const goBack = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1].key);
  };

  const handleSubmit = async () => {
    if (!session?.user?.id || !organizationId) return;
    setSubmitting(true);

    const crops = form.primary_crops
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const livestock = form.primary_livestock
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);

    const { error } = await supabase.from("farmers").insert({
      organization_id: organizationId,
      enrolled_by: session.user.id,
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone || null,
      email: form.email || null,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      national_id: form.national_id || null,
      county: form.county || null,
      sub_county: form.sub_county || null,
      ward: form.ward || null,
      village: form.village || null,
      farm_name: form.farm_name || null,
      farm_size_acres: form.farm_size_acres ? parseFloat(form.farm_size_acres) : null,
      farming_type: form.farming_type,
      primary_crops: crops,
      primary_livestock: livestock,
      annual_income: form.annual_income ? parseFloat(form.annual_income) : null,
      has_bank_account: form.has_bank_account,
      bank_name: form.bank_name || null,
      mobile_money_provider: form.mobile_money_provider || null,
      notes: form.notes || null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Farmer registered", description: `${form.first_name} ${form.last_name} has been onboarded successfully.` });
      setForm(emptyForm);
      setStep("personal");
      navigate("/");
    }
    setSubmitting(false);
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Farmer Onboarding</h1>
        <p className="text-muted-foreground mt-1">Register a new farmer into the system.</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((s, i) => {
          const isActive = s.key === step;
          const isDone = i < stepIndex;
          return (
            <button
              key={s.key}
              onClick={() => setStep(s.key)}
              className={`flex items-center gap-2 flex-1 rounded-lg px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isDone
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Form sections */}
      <div className="kyf-card p-5 sm:p-6 space-y-4">
        {step === "personal" && (
          <>
            <h2 className="text-lg font-semibold text-foreground">Personal Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">First Name *</label>
                <Input value={form.first_name} onChange={(e) => update("first_name", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Last Name *</label>
                <Input value={form.last_name} onChange={(e) => update("last_name", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Phone</label>
                <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+254..." />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email</label>
                <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Date of Birth</label>
                <Input type="date" value={form.date_of_birth} onChange={(e) => update("date_of_birth", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Gender</label>
                <Select value={form.gender} onValueChange={(v) => update("gender", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">National ID</label>
                <Input value={form.national_id} onChange={(e) => update("national_id", e.target.value)} />
              </div>
            </div>
          </>
        )}

        {step === "location" && (
          <>
            <h2 className="text-lg font-semibold text-foreground">Location Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">County</label>
                <Input value={form.county} onChange={(e) => update("county", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Sub-County</label>
                <Input value={form.sub_county} onChange={(e) => update("sub_county", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Ward</label>
                <Input value={form.ward} onChange={(e) => update("ward", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Village</label>
                <Input value={form.village} onChange={(e) => update("village", e.target.value)} />
              </div>
            </div>
          </>
        )}

        {step === "farm" && (
          <>
            <h2 className="text-lg font-semibold text-foreground">Farm Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Farm Name</label>
                <Input value={form.farm_name} onChange={(e) => update("farm_name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Farm Size (acres)</label>
                <Input type="number" step="0.1" value={form.farm_size_acres} onChange={(e) => update("farm_size_acres", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Farming Type</label>
                <Select value={form.farming_type} onValueChange={(v) => update("farming_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crop">Crop</SelectItem>
                    <SelectItem value="livestock">Livestock</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Primary Crops</label>
                <Input value={form.primary_crops} onChange={(e) => update("primary_crops", e.target.value)} placeholder="Maize, Beans, Tea" />
                <p className="text-xs text-muted-foreground">Comma-separated</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Primary Livestock</label>
                <Input value={form.primary_livestock} onChange={(e) => update("primary_livestock", e.target.value)} placeholder="Cattle, Goats, Poultry" />
                <p className="text-xs text-muted-foreground">Comma-separated</p>
              </div>
            </div>
          </>
        )}

        {step === "financial" && (
          <>
            <h2 className="text-lg font-semibold text-foreground">Financial Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Annual Income (USD)</label>
                <Input type="number" value={form.annual_income} onChange={(e) => update("annual_income", e.target.value)} />
              </div>
              <div className="space-y-1.5 flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
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
                  <label className="text-sm font-medium text-foreground">Bank Name</label>
                  <Input value={form.bank_name} onChange={(e) => update("bank_name", e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Mobile Money Provider</label>
                <Select value={form.mobile_money_provider} onValueChange={(v) => update("mobile_money_provider", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ecocash">Ecocash</SelectItem>
                    <SelectItem value="netone">Netone</SelectItem>
                    <SelectItem value="mukuru">Mukuru</SelectItem>
                    <SelectItem value="remit">World Remit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Notes</label>
                <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Any additional observations..." rows={3} />
              </div>
            </div>
          </>
        )}

        {/* Navigation buttons */}
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
              disabled={step === "personal" && (!form.first_name || !form.last_name)}
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
              {submitting ? "Submitting..." : "Register Farmer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


