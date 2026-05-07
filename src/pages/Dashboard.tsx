import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import {
  FileText,
  MapPin,
  TrendingUp,
  ChevronRight,
  Sprout,
  AlertCircle,
  Loader2,
} from "lucide-react";

function computeCompleteness(profile, farmProfile, financialRecord, documents, cropHistory) {
  let filled = 0;
  const total = 5; // 5 sections: personal, farm, crops, financial, documents

  // Personal section: full_name and phone required
  if (profile && profile.full_name && profile.phone) filled++;

  // Farm section: farm_name, farm_size_hectares, region, district
  if (farmProfile && farmProfile.farm_name && farmProfile.farm_size_hectares && farmProfile.region && farmProfile.district) filled++;

  // Crops section: primary_crop set
  if (farmProfile && farmProfile.primary_crop) filled++;

  // Financial section: annual_income and has_bank_account
  if (financialRecord && financialRecord.annual_income && financialRecord.has_bank_account) filled++;

  // Documents section: at least one document uploaded
  if (documents && documents.length > 0) filled++;

  return Math.round((filled / total) * 100);
}

export default function Dashboard() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [farmProfile, setFarmProfile] = useState(null);
  const [financialRecord, setFinancialRecord] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [cropHistory, setCropHistory] = useState([]);

  useEffect(() => {
    if (!userId) return;

    async function fetchData() {
      setLoading(true);
      const [profileRes, farmRes, financialRes, docsRes, cropsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("farm_profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("financial_records").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("documents").select("*").eq("user_id", userId).order("uploaded_at", { ascending: false }),
        supabase.from("crop_history").select("*").eq("user_id", userId).order("year", { ascending: true }),
      ]);

      setProfile(profileRes.data);
      setFarmProfile(farmRes.data);
      setFinancialRecord(financialRes.data);
      setDocuments(docsRes.data || []);
      setCropHistory(cropsRes.data || []);
      setLoading(false);
    }

    fetchData();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const completeness = computeCompleteness(profile, farmProfile, financialRecord, documents, cropHistory);
  const firstName = profile?.full_name?.split(" ")[0] || "Farmer";
  const verifiedDocs = documents.filter((d) => d.status === "verified").length;

  // Yield growth calculation
  let yieldGrowth = 0;
  if (cropHistory.length >= 2) {
    const latest = cropHistory[cropHistory.length - 1];
    const prev = cropHistory[cropHistory.length - 2];
    if (prev.yield_amount && latest.yield_amount && prev.yield_amount > 0) {
      yieldGrowth = Math.round(((latest.yield_amount - prev.yield_amount) / prev.yield_amount) * 100);
    }
  }

  const latestCrop = cropHistory.length > 0 ? cropHistory[cropHistory.length - 1] : null;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8">
      {/* Welcome */}
      <div className="kyf-slide-up">
        <h1 className="text-2xl font-bold text-foreground leading-tight">
          {/* REVIEW IF THIS IS WORKING CORRECTLY */}
          {profile.full_name ? `Welcome back, ${firstName}` : `Hello, ${firstName}`} 
        </h1>
        <p className="text-muted-foreground mt-1">Here's an overview of your agricultural profile.</p>
      </div>

      {/* Profile Completeness Banner */}
      {completeness < 100 && (
        <div className="kyf-card-flat p-5 flex flex-col sm:flex-row sm:items-center gap-4 kyf-slide-up" style={{ animationDelay: "80ms" }}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kyf-sand">
            <AlertCircle className="h-5 w-5 text-kyf-amber" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Complete your profile to unlock credit scoring</p>
            <div className="flex items-center gap-3 mt-2">
              <Progress value={completeness} className="h-2 flex-1" />
              <span className="text-sm font-semibold text-foreground tabular-nums">{completeness}%</span>
            </div>
          </div>
          <Link
            to="/onboarding"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97] shrink-0"
          >
            Continue <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Farm Size",
            value: farmProfile?.farm_size_hectares ? `${farmProfile.farm_size_hectares} ha` : "—",
            icon: MapPin,
            sub: farmProfile?.region || "Not set",
          },
          {
            label: "Primary Crop",
            value: farmProfile?.primary_crop || "—",
            icon: Sprout,
            sub: latestCrop
              ? `${latestCrop.yield_amount || 0} ${latestCrop.yield_unit || "kg"} (${latestCrop.year})`
              : "No yield data",
          },
          {
            label: "Yield Growth",
            value: cropHistory.length >= 2 ? `${yieldGrowth >= 0 ? "+" : ""}${yieldGrowth}%` : "—",
            icon: TrendingUp,
            sub: "Year over year",
          },
          {
            label: "Documents",
            value: `${verifiedDocs}/${documents.length}`,
            icon: FileText,
            sub: "Verified",
          },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="kyf-card p-5 kyf-slide-up"
            style={{ animationDelay: `${160 + i * 60}ms` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</span>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">{stat.value}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Recent Documents */}
      <div className="kyf-slide-up" style={{ animationDelay: "400ms" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Recent Documents</h2>
          <Link to="/documents" className="text-sm text-primary font-medium hover:underline">
            View all
          </Link>
        </div>
        {documents.length === 0 ? (
          <div className="kyf-card-flat p-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
            <Link to="/onboarding" className="text-sm text-primary font-medium hover:underline mt-1 inline-block">
              Upload documents
            </Link>
          </div>
        ) : (
          <div className="kyf-card-flat divide-y divide-border">
            {documents.slice(0, 3).map((doc) => (
              <div key={doc.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <StatusBadge status={doc.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
