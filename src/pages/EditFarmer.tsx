import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import FarmerForm, { FarmerFormState, emptyFarmerForm } from "@/components/onboarding/FarmerForm";

export default function EditFarmer() {
  const { userId: farmerId } = useParams<{ userId: string }>();
  const { session, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [initial, setInitial] = useState<FarmerFormState | null>(null);
  const [editable, setEditable] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    if (!farmerId || !session?.user?.id) return;
    let cancelled = false;

    async function load() {
      if (!farmerId) return;
      setLoading(true);
      const [{ data: farmer }, { data: crops }, { data: yields }] = await Promise.all([
        supabase.from("farmers").select("*").eq("id", farmerId).maybeSingle(),
        supabase.from("farmer_crops").select("*").eq("farmer_id", farmerId).order("position"),
        supabase.from("crop_yield_history").select("*").eq("farmer_id", farmerId),
      ]);

      if (cancelled) return;

      if (!farmer) {
        setLoading(false);
        return;
      }

      const isAdmin = hasAnyRole(["admin", "super_admin", "developer"]);
      const isOwnerEditable =
        farmer.enrolled_by === session?.user?.id &&
        (farmer.status === "draft" || farmer.status === "rejected");
      setEditable(isAdmin || isOwnerEditable);
      setStatus(farmer.status);

      const farmingMethods: Record<string, string> = {};
      (crops || []).forEach((c) => {
        if (c.farming_method) farmingMethods[c.crop] = c.farming_method;
      });
      const yieldHistory: Record<string, { yield: string; revenue: string }> = {};
      (yields || []).forEach((y) => {
        yieldHistory[`${y.crop}_${y.year}`] = {
          yield: y.yield_kg != null ? String(y.yield_kg) : "",
          revenue: y.revenue_usd != null ? String(y.revenue_usd) : "",
        };
      });

      setInitial({
        ...emptyFarmerForm,
        first_name: farmer.first_name ?? "",
        last_name: farmer.last_name ?? "",
        phone: farmer.phone ?? "",
        email: farmer.email ?? "",
        date_of_birth: farmer.date_of_birth ?? "",
        gender: farmer.gender ?? "",
        national_id: farmer.national_id ?? "",
        region: farmer.region ?? "",
        district: farmer.district ?? "",
        ward: farmer.ward ?? "",
        village: farmer.village ?? "",
        farm_name: farmer.farm_name ?? "",
        farm_size_hectares: farmer.farm_size_hectares != null ? String(farmer.farm_size_hectares) : "",
        primary_livestock: farmer.primary_livestock ?? [],
        cropInfo: {
          primaryCrop: crops?.[0]?.crop ?? "",
          secondaryCrop: crops?.[1]?.crop ?? "",
          farmingMethods,
        },
        yieldHistory,
        annual_income: farmer.annual_income != null ? String(farmer.annual_income) : "",
        has_bank_account: !!farmer.has_bank_account,
        bank_name: farmer.bank_name ?? "",
        mobile_money_provider: farmer.mobile_money_provider ?? "",
        notes: farmer.notes ?? "",
      });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [farmerId, session?.user?.id, hasAnyRole]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!initial) {
    return (
      <div className="p-8 max-w-md mx-auto text-center">
        <div className="kyf-card p-6">
          <p className="text-sm text-muted-foreground">Farmer not found.</p>
          <button onClick={() => navigate("/admin/farmers")} className="mt-4 text-sm text-primary underline">
            Back to farmers
          </button>
        </div>
      </div>
    );
  }

  if (!editable) {
    return (
      <div className="p-4 sm:p-6 md:p-8 max-w-2xl mx-auto">
        <div className="kyf-card p-6 text-center space-y-3">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">This record is locked</h2>
          <p className="text-sm text-muted-foreground">
            You can't edit this farmer because the record is currently <span className="font-medium capitalize">{status}</span>.
          </p>
          <Link to={`/admin/farmer/${farmerId}`} className="inline-block text-sm text-primary underline">
            View record
          </Link>
        </div>
      </div>
    );
  }

  return <FarmerForm mode="edit" farmerId={farmerId} initialData={initial} />;
}
