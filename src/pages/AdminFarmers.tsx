import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { isOrgAdmin, isPlatformDeveloper, isFieldAgentOnly } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2,
  Search,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  FileEdit,
  Send,
  Pencil,
  Download,
  ChevronLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toCsv, downloadCsv } from "@/lib/csv";

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
  enrolled_by: string;
  created_at: string;
}

type SortKey = "newest" | "oldest" | "name_asc" | "name_desc" | "status";

const SELECT_COLS =
  "id, first_name, last_name, phone, region, district, ward, village, farm_name, farm_size_hectares, primary_crops, primary_livestock, status, enrolled_by, created_at";

const PAGE_SIZES = [25, 50, 100];

function applySort(
  query: ReturnType<ReturnType<typeof supabase.from>["select"]>,
  sort: SortKey
) {
  switch (sort) {
    case "oldest":
      return query.order("created_at", { ascending: true });
    case "name_asc":
      return query.order("first_name", { ascending: true }).order("last_name", { ascending: true });
    case "name_desc":
      return query.order("first_name", { ascending: false }).order("last_name", { ascending: false });
    case "status":
      return query.order("status", { ascending: true }).order("created_at", { ascending: false });
    case "newest":
    default:
      return query.order("created_at", { ascending: false });
  }
}

function escapeIlike(value: string) {
  return value.replace(/[%_,]/g, (m) => `\\${m}`);
}

export default function AdminFarmers() {
  const { roles, session, organizationId, hasRole, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { can } = usePermissions();
  const isAdmin = isOrgAdmin(roles) || can(PERMISSIONS.farmersVerify);
  const enumeratorOnly = isFieldAgentOnly(roles);

  // URL-backed state
  const statusFilter = searchParams.get("status") || "all";
  const sort = (searchParams.get("sort") as SortKey) || "newest";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = PAGE_SIZES.includes(parseInt(searchParams.get("pageSize") || "", 10))
    ? parseInt(searchParams.get("pageSize")!, 10)
    : 25;
  const urlQuery = searchParams.get("q") || "";

  const [searchInput, setSearchInput] = useState(urlQuery);
  const [debouncedQ, setDebouncedQ] = useState(urlQuery);

  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({
    all: 0,
    draft: 0,
    submitted: 0,
    verified: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Debounce search input → URL
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (debouncedQ === urlQuery) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedQ) next.set("q", debouncedQ);
    else next.delete("q");
    next.set("page", "1");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const updateParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  };

  // Build a base query factory respecting org + filters
  const buildBaseQuery = useCallback(
    (cols: string, withCount: boolean) => {
      let q = withCount
        ? supabase.from("farmers").select(cols, { count: "exact" })
        : supabase.from("farmers").select(cols);
      if (!isPlatformDeveloper(roles) && organizationId) {
        q = q.eq("organization_id", organizationId);
      }
      return q;
    },
    [hasRole, organizationId]
  );

  const applyUserFilters = useCallback(
    (q: any, opts: { status: string; search: string }) => {
      if (opts.status !== "all") q = q.eq("status", opts.status);
      if (opts.search.trim()) {
        const s = escapeIlike(opts.search.trim());
        const like = `%${s}%`;
        q = q.or(
          `first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like},farm_name.ilike.${like},ward.ilike.${like},village.ilike.${like},region.ilike.${like},district.ilike.${like}`
        );
      }
      return q;
    },
    []
  );

  // Load page + status counts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = buildBaseQuery(SELECT_COLS, true);
      q = applyUserFilters(q, { status: statusFilter, search: debouncedQ });
      q = applySort(q, sort).range(from, to);
      const { data, count } = await q;
      if (cancelled) return;
      setFarmers(((data as unknown) as Farmer[]) || []);
      setTotal(count || 0);

      // Status counts — independent of status filter, respect search
      const counts: Record<string, number> = {
        all: 0,
        draft: 0,
        submitted: 0,
        verified: 0,
        rejected: 0,
      };
      const statuses: Array<keyof typeof counts> = [
        "all",
        "draft",
        "submitted",
        "verified",
        "rejected",
      ];
      const results = await Promise.all(
        statuses.map(async (s) => {
          let cq: any = buildBaseQuery("id", true);
          cq = applyUserFilters(cq, { status: s, search: debouncedQ });
          const { count: c } = await cq;
          return [s, c || 0] as const;
        })
      );
      if (cancelled) return;
      for (const [s, c] of results) counts[s] = c;
      setStatusCounts(counts);

      setSelected(new Set());
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [buildBaseQuery, applyUserFilters, statusFilter, debouncedQ, sort, page, pageSize]);

  const deriveType = (f: Farmer): "crop" | "livestock" | "mixed" | "none" => {
    const hasCrops = (f.primary_crops?.length || 0) > 0;
    const hasLivestock = (f.primary_livestock?.length || 0) > 0;
    if (hasCrops && hasLivestock) return "mixed";
    if (hasLivestock) return "livestock";
    if (hasCrops) return "crop";
    return "none";
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "verified":
        return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
      case "rejected":
        return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      case "submitted":
        return <Send className="h-3.5 w-3.5 text-blue-500" />;
      case "draft":
        return <FileEdit className="h-3.5 w-3.5 text-muted-foreground" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
    }
  };

  // Selection helpers — only submitted rows are selectable for bulk actions
  const selectableIds = useMemo(
    () => farmers.filter((f) => f.status === "submitted").map((f) => f.id),
    [farmers]
  );
  const allPageSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const togglePageSelection = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refresh = () => {
    // Bump a no-op param to retrigger by toggling page if at 1
    const next = new URLSearchParams(searchParams);
    setSearchParams(next, { replace: true });
    // Force reload by updating debouncedQ identity
    setDebouncedQ((q) => q + "");
  };

  const bulkVerify = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { data, error } = await supabase
      .from("farmers")
      .update({
        status: "verified",
        verified_by: session?.user?.id,
        verified_at: new Date().toISOString(),
      })
      .in("id", ids)
      .eq("status", "submitted")
      .select("id");
    setBulkBusy(false);
    if (error) {
      toast({ title: "Verify failed", description: error.message, variant: "destructive" });
      return;
    }
    const updated = data?.length ?? 0;
    toast({
      title: `Verified ${updated} farmer(s)`,
      description:
        ids.length !== updated
          ? `${ids.length - updated} skipped (no permission or status changed)`
          : undefined,
    });
    setSelected(new Set());
    refresh();
  };

  const submitBulkReject = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { data, error } = await supabase
      .from("farmers")
      .update({ status: "rejected", notes: rejectReason || null })
      .in("id", ids)
      .eq("status", "submitted")
      .select("id");
    setBulkBusy(false);
    if (error) {
      toast({ title: "Reject failed", description: error.message, variant: "destructive" });
      return;
    }
    const updated = data?.length ?? 0;
    toast({ title: `Rejected ${updated} farmer(s)` });
    setSelected(new Set());
    setRejectReason("");
    setRejectOpen(false);
    refresh();
  };


  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: Farmer[] = [];
      const batchSize = 1000;
      let from = 0;
      while (true) {
        let q = buildBaseQuery(SELECT_COLS, false);
        q = applyUserFilters(q, { status: statusFilter, search: debouncedQ });
        q = applySort(q, sort).range(from, from + batchSize - 1);
        const { data, error } = await q;
        if (error) {
          toast({ title: "Export failed", description: error.message, variant: "destructive" });
          setExporting(false);
          return;
        }
        const rows = ((data as unknown) as Farmer[]) || [];
        all.push(...rows);
        if (rows.length < batchSize) break;
        from += batchSize;
      }
      const csv = toCsv(all, [
        { key: "first_name", header: "First name" },
        { key: "last_name", header: "Last name" },
        { key: "phone", header: "Phone" },
        { key: "region", header: "Region" },
        { key: "district", header: "District" },
        { key: "ward", header: "Ward" },
        { key: "village", header: "Village" },
        { key: "farm_name", header: "Farm name" },
        { key: "farm_size_hectares", header: "Farm size (ha)" },
        { key: "primary_crops", header: "Primary crops" },
        { key: "primary_livestock", header: "Primary livestock" },
        { key: "status", header: "Status" },
        { key: "created_at", header: "Created at" },
      ]);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`farmers-${stamp}.csv`, csv);
      toast({ title: `Exported ${all.length} farmer(s)` });
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {enumeratorOnly ? "My Farmers" : "Farmers"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {total} farmer(s){debouncedQ ? ` matching "${debouncedQ}"` : ""}.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={exporting || total === 0}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, phone, farm, ward, village, region..."
              className="pl-9"
            />
          </div>
          <Select
            value={sort}
            onValueChange={(v) => updateParam({ sort: v === "newest" ? null : v, page: "1" })}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name_asc">Name A → Z</SelectItem>
              <SelectItem value="name_desc">Name Z → A</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex rounded-lg bg-muted p-1 text-xs font-medium overflow-x-auto">
          {(["all", "draft", "submitted", "verified", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => updateParam({ status: s === "all" ? null : s, page: "1" })}
              className={`px-3 py-1.5 rounded-md capitalize transition-colors whitespace-nowrap ${
                statusFilter === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {s} ({statusCounts[s]})
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {isAdmin && selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <p className="text-sm text-foreground">
            <span className="font-semibold">{selected.size}</span> selected
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelected(new Set())}
              disabled={bulkBusy}
            >
              Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setRejectOpen(true)}
              disabled={bulkBusy}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Reject selected
            </Button>
            <Button size="sm" onClick={bulkVerify} disabled={bulkBusy}>
              {bulkBusy ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
              )}
              Verify selected
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="kyf-card-flat divide-y divide-border">
        {/* Bulk select-all row, shown only when there are selectable rows */}
        {isAdmin && selectableIds.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-2 bg-muted/30 text-xs text-muted-foreground">
            <Checkbox
              checked={allPageSelected}
              onCheckedChange={togglePageSelection}
              aria-label="Select all submitted on this page"
            />
            <span>
              Select all {selectableIds.length} submitted row(s) on this page for bulk actions
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : farmers.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">No farmers found.</p>
        ) : (
          farmers.map((f) => {
            const farmBits = [
              f.farm_name,
              f.farm_size_hectares != null ? `${f.farm_size_hectares} ha` : null,
              deriveType(f) !== "none" ? deriveType(f) : null,
            ].filter(Boolean);
            const locationBits = [f.region, f.district, f.ward, f.village].filter(Boolean);
            const crops = f.primary_crops || [];
            const extraCrops = crops.length > 2 ? crops.length - 2 : 0;
            const selectable = isAdmin && f.status === "submitted";
            return (
              <div
                key={f.id}
                className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50 transition-colors"
              >
                {selectable && (
                  <Checkbox
                    checked={selected.has(f.id)}
                    onCheckedChange={() => toggleOne(f.id)}
                    aria-label={`Select ${f.first_name} ${f.last_name}`}
                  />
                )}
                {isAdmin && !selectable && <div className="w-4 shrink-0" />}
                <Link
                  to={`/admin/farmer/${f.id}`}
                  className="flex items-center gap-3 min-w-0 flex-1"
                >
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
                </Link>

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
                  </div>
                  <span className="flex items-center gap-1 text-xs capitalize">
                    {statusIcon(f.status)}
                    {f.status}
                  </span>
                  {(isAdmin ||
                    (f.enrolled_by === session?.user?.id &&
                      (f.status === "draft" || f.status === "rejected"))) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(`/admin/farmer/${f.id}/edit`);
                      }}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      aria-label="Edit farmer"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Showing {showingFrom}–{showingTo} of {total}</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => updateParam({ pageSize: v, page: "1" })}
          >
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => updateParam({ page: String(Math.max(1, page - 1)) })}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </button>
          <span className="px-2 text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => updateParam({ page: String(Math.min(totalPages, page + 1)) })}
            disabled={page >= totalPages || loading}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Bulk reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={(o) => !bulkBusy && setRejectOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {selected.size} farmer(s)</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This reason will be visible to the enumerator on every selected record.
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={bulkBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitBulkReject}
              disabled={bulkBusy}
            >
              {bulkBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Reject {selected.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
