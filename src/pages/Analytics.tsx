import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isOrgAdmin } from "@/lib/permissions";
import { Loader2, BarChart3 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import FarmerAnalyticsCard from "@/components/analytics/FarmerAnalyticsCard";
import OrgAnalyticsDashboard from "@/components/analytics/OrgAnalyticsDashboard";

interface FarmerRow {
  id: string;
  first_name: string;
  last_name: string;
  farm_size_hectares: number | null;
  annual_income: number | null;
  status: string;
  region: string | null;
  district: string | null;
}

export default function Analytics() {
  const { roles, session, hasAnyRole } = useAuth();
  const isAdmin = isOrgAdmin(roles);
  const [farmers, setFarmers] = useState<FarmerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) return;
    void (async () => {
      setLoading(true);
      let q = supabase
        .from("farmers")
        .select("id,first_name,last_name,farm_size_hectares,annual_income,status,region,district")
        .order("last_name");
      if (!isAdmin) q = q.eq("enrolled_by", session.user.id);
      const { data } = await q;
      setFarmers((data as FarmerRow[]) || []);
      setLoading(false);
    })();
  }, [session?.user?.id, isAdmin]);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin
            ? "Org-wide performance plus per-farmer analytics."
            : "Yield trends and Farm Health for the farmers you onboarded."}
        </p>
      </div>

      {isAdmin && <OrgAnalyticsDashboard />}

      <div className="kyf-card p-5">
        <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
          <BarChart3 className="h-4 w-4 text-primary" />
          Per-farmer analytics ({farmers.length})
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : farmers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No farmers to analyze yet.
          </p>
        ) : (
          <Accordion type="multiple" className="w-full">
            {farmers.map((f) => (
              <AccordionItem key={f.id} value={f.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex flex-1 items-center justify-between pr-3 gap-3">
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">
                        {f.first_name} {f.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[f.region, f.district].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground capitalize">
                      {f.status}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <FarmerAnalyticsCard
                    farmerId={f.id}
                    farmerName={`${f.first_name} ${f.last_name}`}
                    farmSize={f.farm_size_hectares}
                    annualIncome={f.annual_income}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}
