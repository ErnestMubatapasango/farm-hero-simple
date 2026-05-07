import { BarChart3 } from "lucide-react";

export default function Analytics() {
  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground mt-1">Crop yield trends and insights.</p>
      </div>
      <div className="kyf-card-flat p-8 text-center">
        <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Analytics dashboards will be available once farmer data collection begins in Phase 2.
        </p>
      </div>
    </div>
  );
}
