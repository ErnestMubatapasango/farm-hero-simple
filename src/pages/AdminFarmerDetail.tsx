import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  ArrowLeft,
  User,
  MapPin,
  Tractor,
  Wallet,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

interface FarmerDetail {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  national_id: string | null;
  region: string | null;
  sub_county: string | null;
  ward: string | null;
  village: string | null;
  farm_name: string | null;
  farm_size_hectares: number | null;
  farming_type: string | null;
  primary_crops: string[] | null;
  primary_livestock: string[] | null;
  annual_income: number | null;
  has_bank_account: boolean | null;
  bank_name: string | null;
  mobile_money_provider: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  verified_at: string | null;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

export default function AdminFarmerDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { session, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const [farmer, setFarmer] = useState<FarmerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const canVerify = hasAnyRole(["admin", "super_admin", "developer"]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("farmers")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setFarmer(data as FarmerDetail | null);
        setLoading(false);
      });
  }, [userId]);

  const updateStatus = async (status: "verified" | "rejected") => {
    if (!farmer || !session?.user?.id) return;
    setUpdating(true);
    const { error } = await supabase
      .from("farmers")
      .update({
        status,
        verified_by: session.user.id,
        verified_at: new Date().toISOString(),
      })
      .eq("id", farmer.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Farmer ${status}` });
      setFarmer((prev) => (prev ? { ...prev, status, verified_at: new Date().toISOString() } : prev));
    }
    setUpdating(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!farmer) {
    return (
      <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto">
        <p className="text-muted-foreground">Farmer not found.</p>
      </div>
    );
  }

  const statusConfig = {
    verified: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10" },
    rejected: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
    pending: { icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500/10" },
  };
  const sc = statusConfig[farmer.status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">
            {farmer.first_name} {farmer.last_name}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`flex items-center gap-1 text-xs font-medium capitalize px-2 py-0.5 rounded-full ${sc.bg} ${sc.color}`}>
              <sc.icon className="h-3 w-3" />
              {farmer.status}
            </span>
            <span className="text-xs text-muted-foreground">
              Registered {new Date(farmer.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Verification actions */}
      {canVerify && farmer.status === "pending" && (
        <div className="flex gap-3">
          <button
            onClick={() => updateStatus("verified")}
            disabled={updating}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <CheckCircle className="h-4 w-4" />
            Verify Farmer
          </button>
          <button
            onClick={() => updateStatus("rejected")}
            disabled={updating}
            className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            <XCircle className="h-4 w-4" />
            Reject
          </button>
        </div>
      )}

      {/* Personal */}
      <div className="kyf-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <User className="h-4 w-4 text-primary" />
          Personal Information
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoRow label="Phone" value={farmer.phone} />
          <InfoRow label="Email" value={farmer.email} />
          <InfoRow label="Date of Birth" value={farmer.date_of_birth} />
          <InfoRow label="Gender" value={farmer.gender} />
          <InfoRow label="National ID" value={farmer.national_id} />
        </div>
      </div>

      {/* Location */}
      <div className="kyf-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-primary" />
          Location
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <InfoRow label="Region" value={farmer.region} />
          <InfoRow label="Sub-County" value={farmer.sub_county} />
          <InfoRow label="Ward" value={farmer.ward} />
          <InfoRow label="Village" value={farmer.village} />
        </div>
      </div>

      {/* Farm */}
      <div className="kyf-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Tractor className="h-4 w-4 text-primary" />
          Farm Information
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoRow label="Farm Name" value={farmer.farm_name} />
          <InfoRow label="Size (hectares)" value={farmer.farm_size_hectares?.toString()} />
          <InfoRow label="Type" value={farmer.farming_type} />
          <InfoRow label="Primary Crops" value={farmer.primary_crops?.join(", ")} />
          <InfoRow label="Primary Livestock" value={farmer.primary_livestock?.join(", ")} />
        </div>
      </div>

      {/* Financial */}
      <div className="kyf-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wallet className="h-4 w-4 text-primary" />
          Financial Information
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoRow label="Annual Income" value={farmer.annual_income ? `KES ${farmer.annual_income.toLocaleString()}` : null} />
          <InfoRow label="Bank Account" value={farmer.has_bank_account ? `Yes — ${farmer.bank_name || "Unknown"}` : "No"} />
          <InfoRow label="Mobile Money" value={farmer.mobile_money_provider} />
        </div>
      </div>

      {/* Notes */}
      {farmer.notes && (
        <div className="kyf-card p-5 space-y-2">
          <p className="text-sm font-semibold text-foreground">Notes</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{farmer.notes}</p>
        </div>
      )}
    </div>
  );
}
