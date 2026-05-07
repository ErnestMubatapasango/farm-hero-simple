import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Sprout, ChevronRight, Loader2 } from "lucide-react";

export default function Dashboard() {
  const { session, roles, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const email = session?.user?.email || "User";
  const roleLabel = roles.length > 0 ? roles.map(r => r.replace("_", " ")).join(", ") : "No role assigned";

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8">
      <div className="kyf-slide-up">
        <h1 className="text-2xl font-bold text-foreground leading-tight">
          Welcome back
        </h1>
        <p className="text-muted-foreground mt-1">{email}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="kyf-card p-5 kyf-slide-up" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Sprout className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your Role</span>
          </div>
          <p className="text-lg font-semibold text-foreground capitalize">{roleLabel}</p>
        </div>
      </div>

      <div className="kyf-card-flat p-8 text-center kyf-slide-up" style={{ animationDelay: "160ms" }}>
        <Sprout className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-foreground mb-1">Getting Started</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Farmer onboarding, document management, analytics, and credit scoring features will be available in Phase 2.
        </p>
      </div>
    </div>
  );
}
