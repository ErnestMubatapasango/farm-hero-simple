import { useEffect, useMemo, useState } from "react";
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
  Sprout,
  BarChart3,
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
  district: string | null;
  ward: string | null;
  village: string | null;
  farm_name: string | null;
  farm_size_hectares: number | null;
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

interface FarmerCrop {
  id: string;
  crop: string;
  position: number;
  farming_method: string | null;
}

interface YieldRow {
  id: string;
  crop: string;
  year: number;
  yield_kg: number | null;
  revenue_usd: number | null;
}

function InfoRow({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: React.ReactNode;
  capitalize?: boolean;
}) {
  const isEmpty =
    value === null || value === undefined || value === "" || (typeof value === "number" && Number.isNaN(value));
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-sm font-medium text-foreground break-words ${
          capitalize ? "capitalize" : ""
        }`}
      >
        {isEmpty ? "—" : value}
      </p>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatNumber(value: number | null | undefined, suffix?: string) {
  if (value === null || value === undefined) return null;
  return suffix ? `${value.toLocaleString()} ${suffix}` : value.toLocaleString();
}

export default function AdminFarmerDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { session, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const [farmer, setFarmer] = useState<FarmerDetail | null>(null);
  const [crops, setCrops] = useState<FarmerCrop[]>([]);
  const [yields, setYields] = useState<YieldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const canVerify = hasAnyRole(["admin", "super_admin", "developer"]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [farmerRes, cropsRes, yieldRes] = await Promise.all([
        supabase.from("farmers").select("*").eq("id", userId).maybeSingle(),
        supabase
          .from("farmer_crops")
          .select("id, crop, position, farming_method")
          .eq("farmer_id", userId)
          .order("position", { ascending: true }),
        supabase
          .from("crop_yield_history")
          .select("id, crop, year, yield_kg, revenue_usd")
          .eq("farmer_id", userId)
          .order("crop", { ascending: true })
          .order("year", { ascending: true }),
      ]);
      if (cancelled) return;
      setFarmer((farmerRes.data as FarmerDetail | null) ?? null);
      setCrops((cropsRes.data as FarmerCrop[]) || []);
      setYields((yieldRes.data as YieldRow[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const yieldsByCrop = useMemo(() => {
    const map = new Map<string, YieldRow[]>();
    for (const y of yields) {
      const arr = map.get(y.crop) || [];
      arr.push(y);
      map.set(y.crop, arr);
    }
    return map;
  }, [yields]);

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
            <span
              className={`flex items-center gap-1 text-xs font-medium capitalize px-2 py-0.5 rounded-full ${sc.bg} ${sc.color}`}
            >
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
          <InfoRow label="Date of Birth" value={formatDate(farmer.date_of_birth)} />
          <InfoRow label="Gender" value={farmer.gender} capitalize />
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
          <InfoRow label="District" value={farmer.district} />
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
          <InfoRow label="Size" value={formatNumber(farmer.farm_size_hectares, "ha")} />
        </div>

        {/* Crops with farming methods */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Sprout className="h-3.5 w-3.5" />
            Crops
          </div>
          {crops.length === 0 ? (
            <p className="text-sm text-muted-foreground">No crops recorded.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {crops.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-border bg-card px-3 py-2 flex items-center justify-between gap-2"
                >
                  <p className="text-sm font-medium text-foreground">{c.crop}</p>
                  {c.farming_method && (
                    <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium capitalize">
                      {c.farming_method}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Livestock */}
        <div className="space-y-2 pt-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Livestock
          </div>
          {(farmer.primary_livestock?.length || 0) === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {farmer.primary_livestock!.map((l) => (
                <span
                  key={l}
                  className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground"
                >
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Yield History */}
      {yieldsByCrop.size > 0 && (
        <div className="kyf-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BarChart3 className="h-4 w-4 text-primary" />
            Yield History
          </div>
          <div className="space-y-4">
            {Array.from(yieldsByCrop.entries()).map(([crop, rows]) => (
              <div key={crop} className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">{crop}</p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Year</th>
                        <th className="px-3 py-2 text-right font-medium">Yield (kg)</th>
                        <th className="px-3 py-2 text-right font-medium">Revenue (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-2 text-foreground">{r.year}</td>
                          <td className="px-3 py-2 text-right text-foreground">
                            {r.yield_kg != null ? r.yield_kg.toLocaleString() : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-foreground">
                            {r.revenue_usd != null ? `$${r.revenue_usd.toLocaleString()}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Financial */}
      <div className="kyf-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wallet className="h-4 w-4 text-primary" />
          Financial Information
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoRow
            label="Annual Income"
            value={farmer.annual_income != null ? `USD ${farmer.annual_income.toLocaleString()}` : null}
          />
          <InfoRow
            label="Bank Account"
            value={farmer.has_bank_account ? `Yes — ${farmer.bank_name || "Unknown"}` : "No"}
          />
          <InfoRow label="Mobile Money" value={farmer.mobile_money_provider} capitalize />
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
