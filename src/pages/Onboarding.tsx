import { Sprout } from "lucide-react";

export default function Onboarding() {
  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Farmer Onboarding</h1>
        <p className="text-muted-foreground mt-1">Onboard farmers into the system.</p>
      </div>
      <div className="kyf-card-flat p-8 text-center">
        <Sprout className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          The farmer onboarding flow will be available in Phase 2. This will allow enumerators to register farmer profiles, farm details, crops, finances, and documents.
        </p>
      </div>
    </div>
  );
}
