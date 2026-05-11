import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Loader2, Search, ChevronRight, Clock, CheckCircle, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Farmer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  region: string | null;
  farming_type: string | null;
  status: string;
  created_at: string;
}

export default function AdminFarmers() {
  const { organizationId, hasRole } = useAuth();
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from("farmers")
        .select("id, first_name, last_name, phone, county, farming_type, status, created_at")
        .order("created_at", { ascending: false });
      if (!hasRole("developer")) {
        query = query.eq("organization_id", organizationId);
      }
      const { data } = await query;
      setFarmers(data || []);
      setLoading(false);
    }
    load();
  }, [organizationId, hasRole]);

  const filtered = farmers.filter((f) => {
    const matchesSearch =
      !search ||
      `${f.first_name} ${f.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      f.phone?.includes(search) ||
      f.county?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "verified": return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
      case "rejected": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
    }
  };

  const counts = {
    all: farmers.length,
    pending: farmers.filter((f) => f.status === "pending").length,
    verified: farmers.filter((f) => f.status === "verified").length,
    rejected: farmers.filter((f) => f.status === "rejected").length,
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
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, county..."
            className="pl-9"
          />
        </div>
        <div className="flex rounded-lg bg-muted p-1 text-xs font-medium">
          {(["all", "pending", "verified", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md capitalize transition-colors ${
                statusFilter === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {s} ({counts[s]})
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="kyf-card-flat divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">No farmers found.</p>
        ) : (
          filtered.map((f) => (
            <Link
              key={f.id}
              to={`/admin/farmer/${f.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  {f.first_name[0]}{f.last_name[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{f.first_name} {f.last_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.county || "No location"} · {f.farming_type || "N/A"}
                    {f.phone && ` · ${f.phone}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs capitalize">
                  {statusIcon(f.status)}
                  {f.status}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
