import { Gauge } from "lucide-react";

export default function CreditScore() {
  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Credit Score</h1>
        <p className="text-muted-foreground mt-1">Farmer creditworthiness assessment.</p>
      </div>
      <div className="kyf-card-flat p-8 text-center">
        <Gauge className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Credit scoring will be available once farmer profiles, financial records, and documents are collected in Phase 2.
        </p>
      </div>
    </div>
  );
}
