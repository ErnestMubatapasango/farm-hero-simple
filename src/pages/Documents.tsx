import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isOrgAdmin } from "@/lib/permissions";
import { Loader2, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import FarmerDocumentsSection from "@/components/farmer/FarmerDocumentsSection";

interface FarmerRow {
  id: string;
  first_name: string;
  last_name: string;
  region: string | null;
  district: string | null;
  organization_id: string;
  enrolled_by: string;
  status: string;
}

interface DocSummary {
  farmer_id: string;
  document_type: string;
  status: string;
}

const REQUIRED_TYPES = ["national_id", "land_title", "id"];

function docCounts(docs: DocSummary[]) {
  const counts = { verified: 0, pending: 0, rejected: 0 };
  docs.forEach((d) => {
    if (d.status === "verified") counts.verified++;
    else if (d.status === "rejected") counts.rejected++;
    else counts.pending++;
  });
  return counts;
}

function requiredSummary(docs: DocSummary[]) {
  const hasId = docs.some((d) => (d.document_type === "national_id" || d.document_type === "id") && d.status !== "rejected");
  const hasLand = docs.some((d) => d.document_type === "land_title" && d.status !== "rejected");
  const total = 2;
  const have = (hasId ? 1 : 0) + (hasLand ? 1 : 0);
  return { have, total };
}

export default function Documents() {
  const { roles, session, hasAnyRole } = useAuth();
  const isAdmin = isOrgAdmin(roles);
  const [farmers, setFarmers] = useState<FarmerRow[]>([]);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!session?.user?.id) return;
    void (async () => {
      setLoading(true);
      let q = supabase
        .from("farmers")
        .select("id,first_name,last_name,region,district,organization_id,enrolled_by,status")
        .order("last_name");
      if (!isAdmin) q = q.eq("enrolled_by", session.user.id);
      const { data: fData } = await q;
      const list = (fData as FarmerRow[]) || [];
      setFarmers(list);

      if (list.length > 0) {
        const { data: dData } = await supabase
          .from("farmer_documents")
          .select("farmer_id,document_type,status")
          .in(
            "farmer_id",
            list.map((f) => f.id),
          );
        setDocs((dData as DocSummary[]) || []);
      } else {
        setDocs([]);
      }
      setLoading(false);
    })();
  }, [session?.user?.id, isAdmin]);

  const byFarmer = useMemo(() => {
    const m = new Map<string, DocSummary[]>();
    docs.forEach((d) => {
      const arr = m.get(d.farmer_id) ?? [];
      arr.push(d);
      m.set(d.farmer_id, arr);
    });
    return m;
  }, [docs]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return farmers;
    return farmers.filter((f) =>
      `${f.first_name} ${f.last_name} ${f.region ?? ""} ${f.district ?? ""}`.toLowerCase().includes(s),
    );
  }, [farmers, search]);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Documents</h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin
            ? "Review, verify, and track documents for every farmer in your organization."
            : "Upload and manage documents for the farmers you onboarded."}
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search farmer, region, district…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="kyf-card-flat p-8 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No farmers match your search.</p>
        </div>
      ) : (
        <Accordion type="multiple" className="w-full space-y-2">
          {filtered.map((f) => {
            const fDocs = byFarmer.get(f.id) ?? [];
            const counts = docCounts(fDocs);
            const req = requiredSummary(fDocs);
            const canEdit =
              isAdmin ||
              (f.enrolled_by === session?.user?.id && (f.status === "draft" || f.status === "rejected"));
            return (
              <AccordionItem key={f.id} value={f.id} className="border border-border rounded-lg px-3">
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex flex-1 flex-col items-start pr-3 gap-2 text-left">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {f.first_name} {f.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[f.region, f.district].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full ${
                          req.have === req.total
                            ? "bg-green-500/10 text-green-600"
                            : "bg-yellow-500/10 text-yellow-600"
                        }`}
                      >
                        Required {req.have}/{req.total}
                      </span>
                      {counts.verified > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">
                          {counts.verified} verified
                        </span>
                      )}
                      {counts.pending > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600">
                          {counts.pending} pending
                        </span>
                      )}
                      {counts.rejected > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                          {counts.rejected} rejected
                        </span>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <FarmerDocumentsSection
                    farmerId={f.id}
                    organizationId={f.organization_id}
                    canEdit={canEdit}
                    isAdmin={isAdmin}
                  />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
