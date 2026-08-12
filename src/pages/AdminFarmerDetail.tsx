import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { isOrgAdmin, isOrgOwner, PERMISSIONS } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { GerminatingLogo } from "@/components/GerminatingLogo";
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
  Send,
  FileEdit,
  History,
  Lock,
  Pencil,
  Undo2,
} from "lucide-react";
import FarmerDocumentsSection from "@/components/farmer/FarmerDocumentsSection";
import FarmerAnalyticsCard from "@/components/analytics/FarmerAnalyticsCard";
import { hasAllRequiredDocs } from "@/components/farmer/RequiredDocumentsChecklist";
import { StatusStepper } from "@/components/farmer/StatusStepper";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

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
  rejection_reason: string | null;
  created_at: string;
  verified_at: string | null;
  enrolled_by: string | null;
  updated_by: string | null;
  updated_at: string | null;
  submitted_at: string | null;
}

interface ActivityRow {
  id: string;
  actor_id: string | null;
  action: string;
  from_status: string | null;
  to_status: string | null;
  notes: string | null;
  created_at: string;
  actor_name?: string | null;
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
  const { roles, session, hasAnyRole, hasRole } = useAuth();
  const { toast } = useToast();
  const [farmer, setFarmer] = useState<FarmerDetail | null>(null);
  const [crops, setCrops] = useState<FarmerCrop[]>([]);
  const [yields, setYields] = useState<YieldRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [requiredDocsOk, setRequiredDocsOk] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);

  const { can } = usePermissions();
  const isAdmin = isOrgAdmin(roles) || can(PERMISSIONS.farmersVerify);
  const isSuperAdmin = isOrgOwner(roles) || can(PERMISSIONS.farmersReopen);
  const isOwner = !!session?.user?.id && farmer?.enrolled_by === session.user.id;
  const editableStatus = farmer?.status === "draft" || farmer?.status === "rejected";
  const canEdit = isAdmin || (hasRole("enumerator") && isOwner && editableStatus);
  const canSubmit = isOwner && editableStatus;
  const canVerifyOrReject = isAdmin && farmer?.status === "submitted";
  const isLocked = farmer?.status === "verified";
  const canReopen =
    isSuperAdmin && (farmer?.status === "verified" || farmer?.status === "rejected");

  const loadActivity = async (farmerId: string) => {
    const { data } = await supabase
      .from("farmer_activity_log")
      .select("id, actor_id, action, from_status, to_status, notes, created_at")
      .eq("farmer_id", farmerId)
      .order("created_at", { ascending: false });
    const rows = (data as ActivityRow[]) || [];
    // Enrich with actor names
    const actorIds = Array.from(
      new Set(rows.map((r) => r.actor_id).filter((v): v is string => !!v))
    );
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", actorIds);
      const nameById = new Map(
        (profiles || []).map((p) => [p.user_id as string, p.full_name as string | null])
      );
      rows.forEach((r) => {
        r.actor_name = r.actor_id ? nameById.get(r.actor_id) || null : null;
      });
    }
    setActivity(rows);
  };

  const loadRequiredDocs = async (farmerId: string) => {
    const { data } = await supabase
      .from("farmer_documents")
      .select("document_type, status")
      .eq("farmer_id", farmerId);
    setRequiredDocsOk(hasAllRequiredDocs((data as { document_type: string; status: string }[]) || []));
  };

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
      await loadActivity(userId);
      await loadRequiredDocs(userId);
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

  const submitForReview = async () => {
    if (!farmer) return;
    setUpdating(true);
    const { error } = await supabase
      .from("farmers")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", farmer.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Submitted for review" });
      setFarmer((prev) => (prev ? { ...prev, status: "submitted" } : prev));
      await loadActivity(farmer.id);
    }
    setUpdating(false);
  };

  const verify = async () => {
    if (!farmer || !session?.user?.id) return;
    setUpdating(true);
    const { error } = await supabase
      .from("farmers")
      .update({
        status: "verified",
        verified_by: session.user.id,
        verified_at: new Date().toISOString(),
      })
      .eq("id", farmer.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Farmer verified" });
      setFarmer((prev) =>
        prev ? { ...prev, status: "verified", verified_at: new Date().toISOString() } : prev
      );
      await loadActivity(farmer.id);
    }
    setUpdating(false);
  };

  const reject = async () => {
    if (!farmer) return;
    const note = rejectReason.trim();
    if (!note) {
      toast({ title: "Reason required", description: "Please provide a rejection reason.", variant: "destructive" });
      return;
    }
    setUpdating(true);
    const { error } = await supabase
      .from("farmers")
      .update({ status: "rejected", rejection_reason: note })
      .eq("id", farmer.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Farmer rejected" });
      setFarmer((prev) => (prev ? { ...prev, status: "rejected", rejection_reason: note } : prev));
      setRejectOpen(false);
      setRejectReason("");
      await loadActivity(farmer.id);
    }
    setUpdating(false);
  };

  const reopen = async () => {
    if (!farmer) return;
    setUpdating(true);
    const { error } = await supabase
      .from("farmers")
      .update({ status: "submitted", verified_at: null, verified_by: null })
      .eq("id", farmer.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Record reopened" });
      setFarmer((prev) => (prev ? { ...prev, status: "submitted", verified_at: null } : prev));
      setReopenOpen(false);
      await loadActivity(farmer.id);
    }
    setUpdating(false);
  };

  if (loading) {
    return <GerminatingLogo fullScreen={false} message="Loading farmer record..." />;
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
    submitted: { icon: Send, color: "text-blue-500", bg: "bg-blue-500/10" },
    draft: { icon: FileEdit, color: "text-muted-foreground", bg: "bg-muted" },
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

      {/* Status stepper */}
      <StatusStepper status={farmer.status} />

      {/* Locked banner */}
      {isLocked && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-2.5 text-sm text-green-700 dark:text-green-400">
          <Lock className="h-4 w-4" />
          This record is verified and locked. Edits are no longer allowed.
        </div>
      )}

      {/* Workflow actions */}
      <div className="flex flex-wrap gap-3">
        {canSubmit && (
          <div className="flex flex-col gap-1">
            <button
              onClick={submitForReview}
              disabled={updating || !requiredDocsOk}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              <Send className="h-4 w-4" />
              Submit for Review
            </button>
            {!requiredDocsOk && (
              <p className="text-xs text-muted-foreground">
                Upload National ID and Land Title before submitting.
              </p>
            )}
          </div>
        )}
        {canVerifyOrReject && (
          <>
            <button
              onClick={verify}
              disabled={updating}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle className="h-4 w-4" />
              Verify Farmer
            </button>
            <button
              onClick={() => { setRejectReason(farmer.rejection_reason || ""); setRejectOpen(true); }}
              disabled={updating}
              className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </button>
          </>
        )}
        {canEdit && !isLocked && (
          <Link
            to={`/admin/farmer/${farmer.id}/edit`}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Edit Farmer
          </Link>
        )}
        {canReopen && (
          <button
            onClick={() => setReopenOpen(true)}
            disabled={updating}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <Undo2 className="h-4 w-4" />
            Reopen for Review
          </button>
        )}
      </div>

      {/* Reject dialog */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this farmer?</AlertDialogTitle>
            <AlertDialogDescription>
              Provide a reason. This will be visible to the enumerator.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection…"
            rows={4}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); reject(); }}
              disabled={updating || !rejectReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject Farmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen dialog */}
      <AlertDialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen for review?</AlertDialogTitle>
            <AlertDialogDescription>
              This moves the record back to Submitted so it can be re-reviewed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); reopen(); }}
              disabled={updating}
            >
              Reopen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Activity log */}
      <div className="kyf-card p-5 space-y-3">
        <button
          type="button"
          onClick={() => setShowActivity((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-foreground w-full"
        >
          <History className="h-4 w-4 text-primary" />
          Activity ({activity.length})
          <span className="ml-auto text-xs text-muted-foreground">
            {showActivity ? "Hide" : "Show"}
          </span>
        </button>
        {showActivity && (
          <div className="space-y-2">
            {activity.length === 0 ? (
              <p className="text-xs text-muted-foreground">No activity recorded.</p>
            ) : (
              activity.map((a) => (
                <div key={a.id} className="text-xs border-l-2 border-border pl-3 py-1">
                  <p className="text-foreground capitalize">
                    <span className="font-medium">
                      {a.actor_name || (a.actor_id ? "Unknown user" : "System")}
                    </span>{" "}
                    <span className="normal-case">{a.action.replace(/_/g, " ")}</span>
                    {a.from_status && a.to_status && (
                      <span className="text-muted-foreground normal-case"> — {a.from_status} → {a.to_status}</span>
                    )}
                  </p>
                  {a.notes && <p className="text-muted-foreground mt-0.5">"{a.notes}"</p>}
                  <p className="text-muted-foreground mt-0.5">
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

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

      {/* Documents */}
      <FarmerDocumentsSection
        farmerId={farmer.id}
        organizationId={(farmer as any).organization_id ?? ""}
        canEdit={canEdit && !isLocked}
        isAdmin={isAdmin}
      />

      {/* Analytics */}
      <FarmerAnalyticsCard
        farmerId={farmer.id}
        farmerName={`${farmer.first_name} ${farmer.last_name}`}
        farmSize={farmer.farm_size_hectares}
        annualIncome={farmer.annual_income}
      />


      {/* Rejection reason (visible only when set) */}
      {farmer.rejection_reason && (
        <div className="kyf-card p-5 space-y-2 border-destructive/40">
          <p className="text-sm font-semibold text-destructive">Rejection reason</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{farmer.rejection_reason}</p>
        </div>
      )}

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
