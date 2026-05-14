import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Loader2, Search, ChevronRight, Clock, CheckCircle, XCircle, FileEdit, Send } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Farmer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  region: string | null;
  district: string | null;
  ward: string | null;
  village: string | null;
  farm_name: string | null;
  farm_size_hectares: number | null;
  
  primary_crops: string[] | null;
  primary_livestock: string[] | null;
  status: string;
  created_at: string;
}

export default function AdminFarmers() {
  const { session, organizationId, hasRole, hasAnyRole } = useAuth();
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Enumerators (without admin powers) only see farmers they enrolled.
  const enumeratorOnly =
    hasRole("enumerator") && !hasAnyRole(["admin", "super_admin", "developer"]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from("farmers")
        .select(
          "id, first_name, last_name, phone, region, district, ward, village, farm_name, farm_size_hectares, primary_crops, primary_livestock, status, created_at"
        )
        .order("created_at", { ascending: false });
      if (!hasRole("developer")) {
        query = query.eq("organization_id", organizationId);
      }
      if (enumeratorOnly && session?.user?.id) {
        query = query.eq("enrolled_by", session.user.id);
      }
      const { data } = await query;
      setFarmers((data as Farmer[]) || []);
      setLoading(false);
    }
    load();
  }, [organizationId, hasRole, enumeratorOnly, session?.user?.id]);

  const deriveType = (f: Farmer): "crop" | "livestock" | "mixed" | "none" => {
    const hasCrops = (f.primary_crops?.length || 0) > 0;
    const hasLivestock = (f.primary_livestock?.length || 0) > 0;
    if (hasCrops && hasLivestock) return "mixed";
    if (hasLivestock) return "livestock";
    if (hasCrops) return "crop";
    return "none";
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return farmers.filter((f) => {
      const matchesSearch =
        !q ||
        `${f.first_name} ${f.last_name}`.toLowerCase().includes(q) ||
        f.phone?.toLowerCase().includes(q) ||
        f.region?.toLowerCase().includes(q) ||
        f.farm_name?.toLowerCase().includes(q) ||
        f.ward?.toLowerCase().includes(q) ||
        f.village?.toLowerCase().includes(q) ||
        f.primary_crops?.some((c) => c.toLowerCase().includes(q));
      const matchesStatus = statusFilter === "all" || f.status === statusFilter;
      const matchesType = typeFilter === "all" || deriveType(f) === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [farmers, search, statusFilter, typeFilter]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "verified":
        return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
      case "rejected":
        return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
    }
  };

  const statusCounts = {
    all: farmers.length,
    pending: farmers.filter((f) => f.status === "pending").length,
    verified: farmers.filter((f) => f.status === "verified").length,
    rejected: farmers.filter((f) => f.status === "rejected").length,
  };
  const typeCounts = {
    all: farmers.length,
    crop: farmers.filter((f) => deriveType(f) === "crop").length,
    livestock: farmers.filter((f) => deriveType(f) === "livestock").length,
    mixed: farmers.filter((f) => deriveType(f) === "mixed").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Farmers</h1>
        <p className="text-muted-foreground mt-1">{farmers.length} farmer(s) registered.</p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, farm, ward, village, crop..."
              className="pl-9"
            />
          </div>
          <div className="flex rounded-lg bg-muted p-1 text-xs font-medium overflow-x-auto">
            {(["all", "pending", "verified", "rejected"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-md capitalize transition-colors whitespace-nowrap ${
                  statusFilter === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {s} ({statusCounts[s]})
              </button>
            ))}
          </div>
        </div>
        <div className="flex rounded-lg bg-muted p-1 text-xs font-medium w-fit overflow-x-auto">
          {(["all", "crop", "livestock", "mixed"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-md capitalize transition-colors whitespace-nowrap ${
                typeFilter === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t} ({typeCounts[t]})
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="kyf-card-flat divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">No farmers found.</p>
        ) : (
          filtered.map((f) => {
            const farmBits = [
              f.farm_name,
              f.farm_size_hectares != null ? `${f.farm_size_hectares} ha` : null,
              deriveType(f) !== "none" ? deriveType(f) : null,
            ].filter(Boolean);
            const locationBits = [f.region, f.district, f.ward, f.village].filter(Boolean);
            const crops = f.primary_crops || [];
            const extraCrops = crops.length > 2 ? crops.length - 2 : 0;
            return (
              <Link
                key={f.id}
                to={`/admin/farmer/${f.id}`}
                className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                    {(f.first_name?.[0] ?? "").toUpperCase()}
                    {(f.last_name?.[0] ?? "").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {f.first_name} {f.last_name}
                    </p>
                    {farmBits.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate capitalize">
                        {farmBits.join(" · ")}
                      </p>
                    )}
                    {locationBits.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate">
                        {locationBits.join(" › ")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="hidden sm:flex items-center gap-1">
                    {crops.slice(0, 2).map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium"
                      >
                        {c}
                      </span>
                    ))}
                    {extraCrops > 0 && (
                      <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-medium">
                        +{extraCrops}
                      </span>
                    )}
                    {/* {(f.primary_livestock?.length || 0) > 0 && (
                      <Beef className="h-3.5 w-3.5 text-muted-foreground" aria-label="Has livestock" />
                    )} */}
                  </div>
                  <span className="flex items-center gap-1 text-xs capitalize">
                    {statusIcon(f.status)}
                    {f.status}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
